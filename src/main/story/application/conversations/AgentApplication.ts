import type {
  AgentRunRequest,
  AgentTurnInput,
  ApplicationEvent,
  ApplicationEventHandler,
  RunSnapshot,
  SerializableError,
} from "../../../../shared/contracts/conversations/applicationContracts.ts";
import AgentFailure from "../../../agent/runtime/AgentFailure.ts";
import type { AgentEvent } from "../../../agent/runtime/AgentEvent.ts";
import type { OrchestrationEvent } from "../../../agent/orchestration/contracts.ts";
import { RunTimedOutError } from "../../../agent/runtime/RunLimits.ts";
import EventPersistenceError from "./events/EventPersistenceError.ts";
import RunEventPublisher from "./events/RunEventPublisher.ts";
import type { AgentRunner } from "./agentPorts.ts";
import ApprovalSessionManager from "./run/ApprovalSessionManager.ts";
import type { CheckpointRecovery, ThreadCheckpointSnapshot } from "../../../agent/checkpoints/CheckpointRecovery.ts";
import ConversationEventAssembler from "./run/ConversationEventAssembler.ts";
import RunStateStore, { type RunRecord } from "./run/RunStateStore.ts";
import type { ApplicationEventRecorder } from "./runPorts.ts";

class RunCancelledError extends Error {
  constructor(runId: string) {
    super(`Run cancelled by user: ${runId}`);
    this.name = "RunCancelledError";
  }
}

function serializeError(error: unknown): SerializableError {
  if (error instanceof AgentFailure) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      phase: error.phase,
      retryable: error.retryable,
    };
  }
  if (error instanceof Error) {
    const timedOut = error instanceof RunTimedOutError;
    const cancelled = error.name === "RunCancelledError";
    return {
      name: error.name,
      message: error.message,
      code:
        error instanceof EventPersistenceError
          ? error.code
          : timedOut
            ? "run.timed_out"
            : cancelled
              ? "run.cancelled"
              : "run.failed",
      phase: "execution",
      retryable: timedOut,
    };
  }

  return {
    name: "Error",
    message: String(error),
    code: "run.failed",
    phase: "execution",
    retryable: false,
  };
}

export type AgentApplicationOptions = {
  readonly withRunContext?: <T>(operation: () => T) => T;
  readonly checkpointRecovery?: CheckpointRecovery;
  readonly eventRecorder?: ApplicationEventRecorder;
  readonly initialRuns?: readonly RunSnapshot[];
  readonly maxRetainedRuns?: number;
};

export default class AgentApplication {
  private readonly runState: RunStateStore;
  private readonly approvals: ApprovalSessionManager;
  resolveApproval(...args: Parameters<ApprovalSessionManager["resolveApproval"]>) {
    return this.approvals.resolveApproval(...args);
  }
  private readonly publisher: RunEventPublisher;
  private readonly assembler: ConversationEventAssembler;

  private acceptingRuns = true;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private readonly runner: AgentRunner,
    private readonly options: AgentApplicationOptions = {},
  ) {
    this.publisher = new RunEventPublisher(options.eventRecorder);
    this.assembler = new ConversationEventAssembler((event) => this.emit(event));
    this.runState = new RunStateStore(options.initialRuns, options.maxRetainedRuns);
    this.approvals = new ApprovalSessionManager(this.runState, runner, this.assembler);

    this.runState.evictSettledRuns();
  }

  hasActiveRuns(): boolean {
    return this.runState.activeCount > 0;
  }

  subscribe(handler: ApplicationEventHandler): () => void {
    return this.publisher.subscribe(handler);
  }

  startRun(request: AgentRunRequest): string {
    if (!this.acceptingRuns) {
      throw new Error("Agent application is shutting down.");
    }
    const threadId = request.threadId.trim();
    const content = request.message.content.trim();

    if (!threadId) {
      throw new Error("Thread id is required.");
    }
    if (!content) {
      throw new Error("Agent input is required.");
    }

    const activeRunId = this.runState.activeForThread(threadId);
    if (activeRunId) {
      throw new Error(`Thread already has an active run: ${threadId} (${activeRunId}).`);
    }

    const runId = `run_${crypto.randomUUID()}`;
    const startedAt = Date.now();
    const record: RunRecord = {
      promise: Promise.resolve(""),
      threadId,
      startedAt: new Date(startedAt).toISOString(),
      checkpointSnapshot: this.captureCheckpoints(threadId),
      status: "running",
      cancelError: null,
      settled: false,
    };
    this.runState.set(runId, record);
    this.runState.markActive(threadId, runId);
    const execute = () =>
      this.executeRun(
        runId,
        threadId,
        {
          message: { ...request.message, content },
          ...(request.context ? { context: request.context } : {}),
        },
        startedAt,
      );
    // Capture the model before executeRun's first asynchronous event or planning step.
    try {
      record.promise = this.options.withRunContext
        ? this.options.withRunContext(execute)
        : execute();
    } catch (error) {
      record.status = "failed";
      record.error = serializeError(error);
      record.settled = true;
      record.promise = null;
      this.runState.clearActive(threadId);
      throw error;
    }
    return runId;
  }

  waitForRun(runId: string): Promise<string> {
    const run = this.runState.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (run.promise) return run.promise;
    if (run.status === "completed") {
      return Promise.resolve(run.content ?? "");
    }
    const error = new Error(run.error?.message ?? `Run did not complete: ${runId}`);
    error.name = run.error?.name ?? "Error";
    return Promise.reject(error);
  }

  getRun(runId: string): RunSnapshot | null {
    const run = this.runState.get(runId);
    return run ? this.runState.toRunSnapshot(runId, run) : null;
  }

  listRuns(): readonly RunSnapshot[] {
    return Object.freeze(
      [...this.runState.entries()]
        .reverse()
        .map(([runId, run]) => this.runState.toRunSnapshot(runId, run)),
    );
  }

  cancelRun(runId: string): boolean {
    const run = this.runState.get(runId);
    if (!run || run.settled) {
      return false;
    }

    const error = new RunCancelledError(runId);
    run.cancelError = error;
    run.status = "cancelling";
    this.approvals.rejectPendingApprovals(runId);
    this.runner.cancelRun(runId, error);
    return true;
  }

  private async executeRun(
    runId: string,
    threadId: string,
    input: AgentTurnInput,
    startedAt: number,
  ): Promise<string> {
    try {
      await this.emit({
        type: "run_started",
        runId,
        threadId,
        timestamp: new Date(startedAt).toISOString(),
      });
      await this.assembler.emitConversation(runId, threadId, {
        type: "user.message.created",
        payload: input.message,
      });
      await this.assembler.emitConversation(runId, threadId, {
        type: "turn.started",
        payload: {},
      });

      const existingRun = this.runState.get(runId);
      if (existingRun?.cancelError) {
        throw existingRun.cancelError;
      }

      const content = await this.runner.run(input, {
        runId,
        threadId,
        approval: (request) => this.approvals.requestApproval(runId, request),
        onChunk: (chunk) => this.assembler.handleTextChunk(runId, threadId, chunk),
        onAgentEvent: (event) => this.handleAgentEvent(runId, event),
        onOrchestrationEvent: (event) => this.handleOrchestrationEvent(runId, threadId, event),
      });
      const interrupted = this.runState.get(runId)?.cancelError;
      if (interrupted) throw interrupted;

      const completedAt = new Date().toISOString();
      const run = this.runState.get(runId);
      if (run) {
        run.completedAt = completedAt;
        run.durationMs = Date.now() - startedAt;
      }

      await this.assembler.completeAnswerBlock(runId, threadId);
      await this.assembler.completeReasoningBlock(runId, threadId);
      const turnCompleted = this.assembler.createEvent(runId, threadId, {
        type: "turn.completed",
        payload: {
          content,
          durationMs: run?.durationMs ?? Date.now() - startedAt,
        },
      });

      await this.publisher.publishBatch([
        turnCompleted,
        {
          type: "run_completed",
          runId,
          content,
          durationMs: run?.durationMs ?? Date.now() - startedAt,
          timestamp: completedAt,
        },
      ]);
      if (run) {
        run.status = "completed";
        run.content = content;
      }
      return content;
    } catch (caught) {
      const error = this.runState.get(runId)?.cancelError ?? caught;
      const type =
        error instanceof RunTimedOutError
          ? "run_timed_out"
          : error instanceof RunCancelledError
            ? "run_aborted"
            : "run_failed";
      const serializedError = serializeError(error);
      const completedAt = new Date().toISOString();
      const run = this.runState.get(runId);
      if (run) {
        run.status = type.replace("run_", "") as "aborted" | "timed_out" | "failed";
        run.error = serializedError;
        run.completedAt = completedAt;
        run.durationMs = Date.now() - startedAt;
        this.restoreCheckpoints(run.checkpointSnapshot);
      }
      const terminal = {
        type,
        runId,
        error: serializedError,
        durationMs: run?.durationMs ?? Date.now() - startedAt,
        timestamp: completedAt,
      } as const;
      if (error instanceof EventPersistenceError) {
        this.runner.cancelRun(runId, error);
        await this.publisher.notify(terminal);
        throw error;
      }
      try {
        await this.assembler.completeAnswerBlock(runId, threadId);
        await this.assembler.completeReasoningBlock(runId, threadId);
        const turnFailed = this.assembler.createEvent(runId, threadId, {
          type: "turn.failed",
          payload: {
            error: serializedError.message,
            code: serializedError.code,
            retryable: serializedError.retryable,
            durationMs: run?.durationMs ?? Date.now() - startedAt,
          },
        });

        await this.publisher.publishBatch([turnFailed, terminal]);
      } catch (recordError) {
        if (run) run.error = serializeError(recordError);
        await this.publisher.notify({ ...terminal, error: serializeError(recordError) });
        throw recordError;
      }
      throw error;
    } finally {
      const run = this.runState.get(runId);
      if (run) {
        run.settled = true;
      }
      if (this.runState.activeForThread(threadId) === runId) {
        this.runState.clearActive(threadId);
      }
      this.approvals.rejectPendingApprovals(runId);

      this.assembler.clearRun(runId);
      this.runState.evictSettledRuns();
    }
  }

  private async handleAgentEvent(rootRunId: string, event: AgentEvent): Promise<void> {
    if (event.type === "skill_selected") {
      return;
    }

    if (event.type === "text_delta") {
      return;
    }

    if (event.type === "reasoning_delta") {
      const run = this.runState.get(rootRunId);
      if (run) {
        await this.assembler.handleReasoningChunk(rootRunId, run.threadId, event.content);
      }
      return;
    }

    if (event.agentType === "main" && event.type.startsWith("run_")) return;

    switch (event.type) {
      case "tool_approval_requested": {
        const run = this.runState.get(rootRunId);
        if (run) {
          await this.assembler.completeAnswerBlock(rootRunId, run.threadId);
          await this.assembler.completeReasoningBlock(rootRunId, run.threadId);
        }
        return;
      }
      case "tool_started":
      case "tool_approved":
      case "tool_rejected":
      case "tool_completed":
      case "tool_failed": {
        const run = this.runState.get(rootRunId);
        if (run && event.type === "tool_started") {
          await this.assembler.completeAnswerBlock(rootRunId, run.threadId);
          await this.assembler.completeReasoningBlock(rootRunId, run.threadId);
        }
        if (!run || event.type === "tool_approved") return;
        if (event.type === "tool_started") {
          await this.assembler.emitConversation(rootRunId, run.threadId, {
            type: "tool.call.started",
            payload: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              summary: event.summary,
            },
          });
          return;
        }
        if (event.type === "tool_completed") {
          await this.assembler.emitConversation(rootRunId, run.threadId, {
            type: "tool.call.completed",
            payload: { toolCallId: event.toolCallId },
          });
          return;
        }
        if (event.type === "tool_failed") {
          await this.assembler.emitConversation(rootRunId, run.threadId, {
            type: "tool.call.failed",
            payload: {
              toolCallId: event.toolCallId,
              error: event.error,
            },
          });
          return;
        }
        await this.assembler.emitConversation(rootRunId, run.threadId, {
          type: "tool.call.rejected",
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            summary: event.summary,
            reason: "工具调用已被拒绝",
          },
        });
        return;
      }
      case "run_started":
      case "run_completed":
      case "run_aborted":
      case "run_timed_out":
      case "run_failed":
        return;
    }
  }

  private async handleOrchestrationEvent(
    runId: string,
    threadId: string,
    event: OrchestrationEvent,
  ): Promise<void> {
    switch (event.type) {
      case "task_started":
        await this.assembler.emitConversation(runId, threadId, {
          type: "task.started",
          payload: {
            taskId: event.taskId,
            title: event.title,
            agentId: event.agentType,
            attempt: event.attempt,
          },
        });
        return;
      case "task_reviewed":
        await this.assembler.emitConversation(runId, threadId, {
          type: "task.progress",
          payload: {
            taskId: event.taskId,
            summary: `验收结果：${event.decision}（${Math.round(event.score * 100)}%）`,
          },
        });
        return;
      case "task_retrying":
        await this.assembler.emitConversation(runId, threadId, {
          type: "task.progress",
          payload: {
            taskId: event.taskId,
            summary: `准备第 ${event.nextAttempt} 次执行`,
          },
        });
        return;
      case "task_completed":
        await this.assembler.emitConversation(runId, threadId, {
          type: "task.completed",
          payload: { taskId: event.taskId, summary: "任务已完成" },
        });
        return;
      case "task_failed":
        await this.assembler.emitConversation(runId, threadId, {
          type: "task.failed",
          payload: { taskId: event.taskId, failure: event.failure },
        });
        return;
      case "task_skipped":
        await this.assembler.emitConversation(runId, threadId, {
          type: "task.failed",
          payload: { taskId: event.taskId, failure: event.failure },
        });
        return;
      case "plan_created":
      case "synthesis_started":
      case "synthesis_completed":
        return;
    }
  }

  private captureCheckpoints(threadId: string): ThreadCheckpointSnapshot | null {
    return this.options.checkpointRecovery?.capture(threadId) ?? null;
  }

  private restoreCheckpoints(snapshot: ThreadCheckpointSnapshot | null): void {
    if (!snapshot || !this.options.checkpointRecovery) return;
    try {
      this.options.checkpointRecovery.restore(snapshot);
    } catch (error) {
      console.error("Checkpoint recovery failed", error);
      // The original run error remains visible.
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.acceptingRuns = false;
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    const activeRuns = [...this.runState.activeIds()]
      .map((runId) => this.runState.get(runId))
      .filter((run): run is RunRecord => Boolean(run));
    for (const runId of [...this.runState.activeIds()]) {
      this.cancelRun(runId);
    }
    await Promise.allSettled(
      activeRuns
        .map((run) => run.promise)
        .filter((promise): promise is Promise<string> => promise !== null),
    );
    for (const runId of [...this.runState.activeIds()]) {
      this.approvals.rejectPendingApprovals(runId);
    }
    try {
      await this.publisher.close();
    } finally {
      this.approvals.clear();
      this.assembler.clear();

      this.runState.clear();
    }
  }

  private async emit(event: ApplicationEvent): Promise<void> {
    const runId = "runId" in event ? event.runId : undefined;
    const run = runId ? this.runState.get(runId) : undefined;
    if (run?.cancelError instanceof EventPersistenceError) throw run.cancelError;
    try {
      await this.publisher.publish(event);
    } catch (error) {
      if (run && runId && error instanceof EventPersistenceError) {
        run.cancelError = error;
        this.approvals.rejectPendingApprovals(runId);
        this.runner.cancelRun("runId" in event ? event.runId : "", error);
      }
      throw error;
    }
  }
}
