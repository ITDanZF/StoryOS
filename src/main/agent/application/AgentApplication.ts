import type { AgentEvent } from "../Agent/AgentEvent.ts";
import { RunTimedOutError } from "../Agent/RunLimits.ts";
import SqliteStore, {
  type ThreadCheckpointSnapshot,
} from "../Memory/SqliteStore.ts";
import { createToolApprovalPreview } from "../security/ToolPreview.ts";
import type {
  ToolApprovalDecision,
  ToolApprovalRequest,
} from "../security/ToolPolicy.ts";
import type {
  ApplicationEvent,
  ApplicationEventHandler,
  RunSnapshot,
  RunStatus,
  SerializableError,
  AgentRunRequest,
  AgentTurnInput,
} from "./contracts.ts";
import type { AgentRunner } from "./ports.ts";
import type { ApplicationEventRecorder } from "./runPorts.ts";
import type { ConversationEvent } from "./conversationEvents.ts";
import type { OrchestrationEvent } from "../Agent/orchestration/contracts.ts";
import AgentFailure from "../errors/AgentFailure.ts";

type ConversationEventInput = ConversationEvent extends infer TEvent
  ? TEvent extends ConversationEvent
    ? Omit<TEvent, "eventId" | "sequence" | "threadId" | "runId" | "timestamp">
    : never
  : never;

type RunRecord = {
  promise: Promise<string> | null;
  readonly threadId: string;
  readonly startedAt: string;
  readonly checkpointSnapshot: ThreadCheckpointSnapshot | null;
  status: RunStatus;
  completedAt?: string;
  durationMs?: number;
  content?: string;
  error?: SerializableError;
  cancelError: RunCancelledError | null;
  settled: boolean;
};

type PendingApproval = {
  readonly runId: string;
  readonly toolCallId: string;
  readonly resolve: (decision: ToolApprovalDecision) => void;
};

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
      code: timedOut ? "run.timed_out" : cancelled ? "run.cancelled" : "run.failed",
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
  readonly checkpointPath?: string;
  readonly eventRecorder?: ApplicationEventRecorder;
  readonly initialRuns?: readonly RunSnapshot[];
  readonly maxRetainedRuns?: number;
};

export default class AgentApplication {
  private readonly subscribers = new Set<ApplicationEventHandler>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly activeRunIdsByThread = new Map<string, string>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly conversationSequences = new Map<string, number>();
  private readonly activeAnswerBlocks = new Map<string, {
    readonly stepId: string;
    readonly blockId: string;
  }>();
  private readonly answerBlockCounts = new Map<string, number>();
  private readonly activeReasoningBlocks = new Map<string, {
    readonly stepId: string;
    readonly blockId: string;
  }>();
  private readonly reasoningBlockCounts = new Map<string, number>();
  private readonly maxRetainedRuns: number;
  private acceptingRuns = true;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private readonly runner: AgentRunner,
    private readonly options: AgentApplicationOptions = {},
  ) {
    this.maxRetainedRuns = options.maxRetainedRuns ?? 100;
    if (!Number.isInteger(this.maxRetainedRuns) || this.maxRetainedRuns < 0) {
      throw new Error("maxRetainedRuns must be a non-negative integer.");
    }
    for (const snapshot of [...(options.initialRuns ?? [])].reverse()) {
      this.runs.set(snapshot.runId, {
        promise: null,
        threadId: snapshot.threadId,
        startedAt: snapshot.startedAt,
        checkpointSnapshot: null,
        status: snapshot.status,
        ...(snapshot.completedAt ? { completedAt: snapshot.completedAt } : {}),
        ...(snapshot.durationMs !== undefined
          ? { durationMs: snapshot.durationMs }
          : {}),
        ...(snapshot.content !== undefined ? { content: snapshot.content } : {}),
        ...(snapshot.error ? { error: snapshot.error } : {}),
        cancelError: null,
        settled: true,
      });
    }
    this.evictSettledRuns();
  }

  hasActiveRuns(): boolean {
    return this.activeRunIdsByThread.size > 0;
  }

  subscribe(handler: ApplicationEventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
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

    const activeRunId = this.activeRunIdsByThread.get(threadId);
    if (activeRunId) {
      throw new Error(
        `Thread already has an active run: ${threadId} (${activeRunId}).`,
      );
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
    this.runs.set(runId, record);
    this.activeRunIdsByThread.set(threadId, runId);
    const promise = this.executeRun(
      runId,
      threadId,
      {
        message: { ...request.message, content },
        ...(request.context ? { context: request.context } : {}),
      },
      startedAt,
    );
    record.promise = promise;
    return runId;
  }

  waitForRun(runId: string): Promise<string> {
    const run = this.runs.get(runId);
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
    const run = this.runs.get(runId);
    return run ? this.toRunSnapshot(runId, run) : null;
  }

  listRuns(): readonly RunSnapshot[] {
    return Object.freeze(
      [...this.runs.entries()]
        .reverse()
        .map(([runId, run]) => this.toRunSnapshot(runId, run)),
    );
  }

  cancelRun(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.settled) {
      return false;
    }

    const error = new RunCancelledError(runId);
    run.cancelError = error;
    run.status = "cancelling";
    this.rejectPendingApprovals(runId);
    this.runner.cancelRun(runId, error);
    return true;
  }

  async resolveApproval(
    approvalId: string,
    decision: ToolApprovalDecision,
  ): Promise<boolean> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return false;
    }

    this.pendingApprovals.delete(approvalId);
    pending.resolve(decision);
    const run = this.runs.get(pending.runId);
    if (run) {
      await this.emitConversation(pending.runId, run.threadId, {
        type: "approval.resolved",
        payload: {
          approvalId,
          toolCallId: pending.toolCallId,
          decision,
        },
      });
    }
    return true;
  }

  private async executeRun(
    runId: string,
    threadId: string,
    input: AgentTurnInput,
    startedAt: number,
  ): Promise<string> {
    await this.emit({
      type: "run_started",
      runId,
      threadId,
      timestamp: new Date(startedAt).toISOString(),
    });
    await this.emitConversation(runId, threadId, {
      type: "user.message.created",
      payload: input.message,
    });
    await this.emitConversation(runId, threadId, {
      type: "turn.started",
      payload: {},
    });

    try {
      const existingRun = this.runs.get(runId);
      if (existingRun?.cancelError) {
        throw existingRun.cancelError;
      }

      const content = await this.runner.run(input, {
        runId,
        threadId,
        approval: (request) => this.requestApproval(runId, request),
        onChunk: (chunk) => this.handleTextChunk(runId, threadId, chunk),
        onAgentEvent: (event) => this.handleAgentEvent(runId, event),
        onOrchestrationEvent: (event) =>
          this.handleOrchestrationEvent(runId, threadId, event),
      });

      const completedAt = new Date().toISOString();
      const run = this.runs.get(runId);
      if (run) {
        run.status = "completed";
        run.content = content;
        run.completedAt = completedAt;
        run.durationMs = Date.now() - startedAt;
      }

      await this.completeAnswerBlock(runId, threadId);
      await this.completeReasoningBlock(runId, threadId);
      await this.emitConversation(runId, threadId, {
        type: "turn.completed",
        payload: {
          content,
          durationMs: run?.durationMs ?? Date.now() - startedAt,
        },
      });

      await this.emit({
        type: "run_completed",
        runId,
        content,
        durationMs: run?.durationMs ?? Date.now() - startedAt,
        timestamp: completedAt,
      });
      return content;
    } catch (error) {
      const type = error instanceof RunTimedOutError
        ? "run_timed_out"
        : error instanceof RunCancelledError
          ? "run_aborted"
          : "run_failed";
      const serializedError = serializeError(error);
      const completedAt = new Date().toISOString();
      const run = this.runs.get(runId);
      if (run) {
        run.status = type.replace("run_", "") as
          | "aborted"
          | "timed_out"
          | "failed";
        run.error = serializedError;
        run.completedAt = completedAt;
        run.durationMs = Date.now() - startedAt;
        this.restoreCheckpoints(run.checkpointSnapshot);
      }


      await this.completeAnswerBlock(runId, threadId);
      await this.completeReasoningBlock(runId, threadId);
      await this.emitConversation(runId, threadId, {
        type: "turn.failed",
        payload: {
          error: serializedError.message,
          code: serializedError.code,
          retryable: serializedError.retryable,
          durationMs: run?.durationMs ?? Date.now() - startedAt,
        },
      });

      await this.emit({
        type,
        runId,
        error: serializedError,
        durationMs: run?.durationMs ?? Date.now() - startedAt,
        timestamp: completedAt,
      });
      throw error;
    } finally {
      const run = this.runs.get(runId);
      if (run) {
        run.settled = true;
      }
      if (this.activeRunIdsByThread.get(threadId) === runId) {
        this.activeRunIdsByThread.delete(threadId);
      }
      this.rejectPendingApprovals(runId);
      this.activeAnswerBlocks.delete(runId);
      this.answerBlockCounts.delete(runId);
      this.activeReasoningBlocks.delete(runId);
      this.reasoningBlockCounts.delete(runId);
      this.conversationSequences.delete(runId);
      this.evictSettledRuns();
    }
  }

  private async handleTextChunk(
    runId: string,
    threadId: string,
    chunk: string,
  ): Promise<void> {
    await this.completeReasoningBlock(runId, threadId);
    let block = this.activeAnswerBlocks.get(runId);
    if (!block) {
      const blockNumber = (this.answerBlockCounts.get(runId) ?? 0) + 1;
      this.answerBlockCounts.set(runId, blockNumber);
      block = {
        stepId: `step-${blockNumber}`,
        blockId: `answer-${blockNumber}`,
      };
      this.activeAnswerBlocks.set(runId, block);
      await this.emitConversation(runId, threadId, {
        type: "assistant.block.started",
        stepId: block.stepId,
        blockId: block.blockId,
        payload: { channel: "answer" },
      });
    }

    await this.emitConversation(runId, threadId, {
      type: "assistant.block.delta",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "answer", delta: chunk },
    });
  }

  private async completeAnswerBlock(
    runId: string,
    threadId: string,
  ): Promise<void> {
    const block = this.activeAnswerBlocks.get(runId);
    if (!block) return;
    this.activeAnswerBlocks.delete(runId);
    await this.emitConversation(runId, threadId, {
      type: "assistant.block.completed",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "answer" },
    });
  }

  private async handleReasoningChunk(
    runId: string,
    threadId: string,
    chunk: string,
  ): Promise<void> {
    let block = this.activeReasoningBlocks.get(runId);
    if (!block) {
      const blockNumber = (this.reasoningBlockCounts.get(runId) ?? 0) + 1;
      this.reasoningBlockCounts.set(runId, blockNumber);
      block = {
        stepId: `reasoning-step-${blockNumber}`,
        blockId: `reasoning-${blockNumber}`,
      };
      this.activeReasoningBlocks.set(runId, block);
      await this.emitConversation(runId, threadId, {
        type: "assistant.block.started",
        stepId: block.stepId,
        blockId: block.blockId,
        payload: { channel: "reasoning" },
      });
    }
    await this.emitConversation(runId, threadId, {
      type: "assistant.block.delta",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "reasoning", delta: chunk },
    });
  }

  private async completeReasoningBlock(
    runId: string,
    threadId: string,
  ): Promise<void> {
    const block = this.activeReasoningBlocks.get(runId);
    if (!block) return;
    this.activeReasoningBlocks.delete(runId);
    await this.emitConversation(runId, threadId, {
      type: "assistant.block.completed",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "reasoning" },
    });
  }

  private requestApproval(
    runId: string,
    request: ToolApprovalRequest,
  ): Promise<ToolApprovalDecision> {
    const approvalId = `approval_${crypto.randomUUID()}`;
    const decision = new Promise<ToolApprovalDecision>((resolve) => {
      this.pendingApprovals.set(approvalId, {
        runId,
        toolCallId: request.toolCallId,
        resolve,
      });
    });

    const run = this.runs.get(runId);
    const preview = createToolApprovalPreview(request);
    void (async () => {
      if (run) {
        await this.emitConversation(runId, run.threadId, {
          type: "approval.requested",
          payload: {
            approvalId,
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            summary: request.summary,
            preview,
          },
        });
      }
    })();
    return decision;
  }

  private async handleAgentEvent(
    rootRunId: string,
    event: AgentEvent,
  ): Promise<void> {
    if (event.type === "skill_selected") {
      return;
    }

    if (event.type === "text_delta") {
      return;
    }

    if (event.type === "reasoning_delta") {
      const run = this.runs.get(rootRunId);
      if (run) {
        await this.handleReasoningChunk(rootRunId, run.threadId, event.content);
      }
      return;
    }

    if (event.agentType === "main" && event.type.startsWith("run_")) return;

    switch (event.type) {
      case "tool_approval_requested": {
        const run = this.runs.get(rootRunId);
        if (run) {
          await this.completeAnswerBlock(rootRunId, run.threadId);
          await this.completeReasoningBlock(rootRunId, run.threadId);
        }
        return;
      }
      case "tool_started":
      case "tool_approved":
      case "tool_rejected":
      case "tool_completed":
      case "tool_failed": {
        const run = this.runs.get(rootRunId);
        if (run && event.type === "tool_started") {
          await this.completeAnswerBlock(rootRunId, run.threadId);
          await this.completeReasoningBlock(rootRunId, run.threadId);
        }
        if (!run || event.type === "tool_approved") return;
        if (event.type === "tool_started") {
          await this.emitConversation(rootRunId, run.threadId, {
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
          await this.emitConversation(rootRunId, run.threadId, {
            type: "tool.call.completed",
            payload: { toolCallId: event.toolCallId },
          });
          return;
        }
        if (event.type === "tool_failed") {
          await this.emitConversation(rootRunId, run.threadId, {
            type: "tool.call.failed",
            payload: {
              toolCallId: event.toolCallId,
              error: event.error,
            },
          });
          return;
        }
        await this.emitConversation(rootRunId, run.threadId, {
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
        await this.emitConversation(runId, threadId, {
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
        await this.emitConversation(runId, threadId, {
          type: "task.progress",
          payload: {
            taskId: event.taskId,
            summary: `验收结果：${event.decision}（${Math.round(event.score * 100)}%）`,
          },
        });
        return;
      case "task_retrying":
        await this.emitConversation(runId, threadId, {
          type: "task.progress",
          payload: {
            taskId: event.taskId,
            summary: `准备第 ${event.nextAttempt} 次执行`,
          },
        });
        return;
      case "task_completed":
        await this.emitConversation(runId, threadId, {
          type: "task.completed",
          payload: { taskId: event.taskId, summary: "任务已完成" },
        });
        return;
      case "task_failed":
        await this.emitConversation(runId, threadId, {
          type: "task.failed",
          payload: { taskId: event.taskId, failure: event.failure },
        });
        return;
      case "task_skipped":
        await this.emitConversation(runId, threadId, {
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

  private rejectPendingApprovals(runId: string): void {
    for (const [approvalId, pending] of this.pendingApprovals) {
      if (pending.runId === runId) {
        this.pendingApprovals.delete(approvalId);
        pending.resolve("deny");
      }
    }
  }

  private captureCheckpoints(
    threadId: string,
  ): ThreadCheckpointSnapshot | null {
    if (!this.options.checkpointPath) return null;
    return SqliteStore.captureThreadCheckpoints(
      threadId,
      this.options.checkpointPath,
    );
  }

  private restoreCheckpoints(
    snapshot: ThreadCheckpointSnapshot | null,
  ): void {
    if (!snapshot || !this.options.checkpointPath) return;
    try {
      SqliteStore.restoreThreadCheckpoints(
        snapshot,
        this.options.checkpointPath,
      );
    } catch {
      // Best-effort rollback only. The original run error remains visible.
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.acceptingRuns = false;
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    const activeRuns = [...this.activeRunIdsByThread.values()]
      .map((runId) => this.runs.get(runId))
      .filter((run): run is RunRecord => Boolean(run));
    for (const runId of [...this.activeRunIdsByThread.values()]) {
      this.cancelRun(runId);
    }
    await Promise.allSettled(
      activeRuns
        .map((run) => run.promise)
        .filter((promise): promise is Promise<string> => promise !== null),
    );
    for (const runId of [...this.activeRunIdsByThread.values()]) {
      this.rejectPendingApprovals(runId);
    }
    await this.options.eventRecorder?.flush?.();
    await this.options.eventRecorder?.close?.();
    this.subscribers.clear();
    this.pendingApprovals.clear();
    this.activeAnswerBlocks.clear();
    this.answerBlockCounts.clear();
    this.activeReasoningBlocks.clear();
    this.reasoningBlockCounts.clear();
    this.conversationSequences.clear();
    this.activeRunIdsByThread.clear();
    this.runs.clear();
  }

  private evictSettledRuns(): void {
    const settledRunIds = [...this.runs.entries()]
      .filter(([, run]) => run.settled)
      .map(([runId]) => runId);
    const excess = settledRunIds.length - this.maxRetainedRuns;
    for (const runId of settledRunIds.slice(0, Math.max(0, excess))) {
      this.runs.delete(runId);
    }
  }

  private toRunSnapshot(runId: string, run: RunRecord): RunSnapshot {
    return Object.freeze({
      runId,
      threadId: run.threadId,
      status: run.status,
      startedAt: run.startedAt,
      ...(run.completedAt ? { completedAt: run.completedAt } : {}),
      ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
      ...(run.content !== undefined ? { content: run.content } : {}),
      ...(run.error ? { error: Object.freeze({ ...run.error }) } : {}),
    });
  }

  private async emitConversation(
    runId: string,
    threadId: string,
    input: ConversationEventInput,
  ): Promise<void> {
    const sequence = (this.conversationSequences.get(runId) ?? 0) + 1;
    this.conversationSequences.set(runId, sequence);
    const event = Object.freeze({
      ...input,
      eventId: `conversation_event_${crypto.randomUUID()}`,
      sequence,
      runId,
      threadId,
      timestamp: new Date().toISOString(),
    }) as ConversationEvent;
    await this.emit(event);
  }

  private async emit(event: ApplicationEvent): Promise<void> {
    if (this.options.eventRecorder) {
      await Promise.allSettled([this.options.eventRecorder.record(event)]);
    }
    await Promise.allSettled(
      [...this.subscribers].map((subscriber) => subscriber(event)),
    );
  }
}
