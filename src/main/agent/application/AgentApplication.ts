import type { AgentEvent } from "../Agent/AgentEvent.ts";
import { RunTimedOutError } from "../Agent/RunLimits.ts";
import SqliteStore from "../Memory/SqliteStore.ts";
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
  StartRunRequest,
} from "./contracts.ts";
import type { AgentRunner } from "./ports.ts";

type RunRecord = {
  promise: Promise<string>;
  readonly threadId: string;
  readonly startedAt: string;
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
  readonly resolve: (decision: ToolApprovalDecision) => void;
};

class RunCancelledError extends Error {
  constructor(runId: string) {
    super(`Run cancelled by user: ${runId}`);
    this.name = "RunCancelledError";
  }
}

function serializeError(error: unknown): SerializableError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { name: "Error", message: String(error) };
}

export default class AgentApplication {
  private readonly subscribers = new Set<ApplicationEventHandler>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();

  constructor(private readonly runner: AgentRunner) {}

  subscribe(handler: ApplicationEventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  startRun(request: StartRunRequest): string {
    const threadId = request.threadId.trim();
    const input = request.input.trim();

    if (!threadId) {
      throw new Error("Thread id is required.");
    }
    if (!input) {
      throw new Error("Agent input is required.");
    }

    const runId = `run_${crypto.randomUUID()}`;
    const startedAt = Date.now();
    const record: RunRecord = {
      promise: Promise.resolve(""),
      threadId,
      startedAt: new Date(startedAt).toISOString(),
      status: "running",
      cancelError: null,
      settled: false,
    };
    this.runs.set(runId, record);
    const promise = this.executeRun(runId, threadId, input, startedAt);
    record.promise = promise;
    return runId;
  }

  waitForRun(runId: string): Promise<string> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run.promise;
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
    await this.emit({
      type: "approval_resolved",
      runId: pending.runId,
      approvalId,
      decision,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  private async executeRun(
    runId: string,
    threadId: string,
    input: string,
    startedAt: number,
  ): Promise<string> {
    await this.emit({
      type: "run_started",
      runId,
      threadId,
      timestamp: new Date(startedAt).toISOString(),
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
        onChunk: (chunk) =>
          this.emit({
            type: "text_delta",
            runId,
            content: chunk,
            timestamp: new Date().toISOString(),
          }),
        onAgentEvent: (event) => this.handleAgentEvent(runId, event),
        onOrchestrationEvent: (event) => this.emit(event),
      });

      const completedAt = new Date().toISOString();
      const run = this.runs.get(runId);
      if (run) {
        run.status = "completed";
        run.content = content;
        run.completedAt = completedAt;
        run.durationMs = Date.now() - startedAt;
      }

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
      }

      await this.emit({
        type,
        runId,
        error: serializedError,
        durationMs: run?.durationMs ?? Date.now() - startedAt,
        timestamp: completedAt,
      });
      this.clearFailedRunCheckpoints(threadId);
      throw error;
    } finally {
      const run = this.runs.get(runId);
      if (run) {
        run.settled = true;
      }
      this.rejectPendingApprovals(runId);
    }
  }

  private requestApproval(
    runId: string,
    request: ToolApprovalRequest,
  ): Promise<ToolApprovalDecision> {
    const approvalId = `approval_${crypto.randomUUID()}`;
    const decision = new Promise<ToolApprovalDecision>((resolve) => {
      this.pendingApprovals.set(approvalId, { runId, resolve });
    });

    void this.emit({
      type: "approval_requested",
      runId,
      approvalId,
      toolName: request.toolName,
      summary: request.summary,
      preview: createToolApprovalPreview(request),
      timestamp: new Date().toISOString(),
    });
    return decision;
  }

  private async handleAgentEvent(
    rootRunId: string,
    event: AgentEvent,
  ): Promise<void> {
    if (event.type === "skill_selected") {
      await this.emit({
        type: "skill_selected",
        runId: rootRunId,
        skills: event.skills,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (event.agentType === "main" || event.type === "text_delta") {
      return;
    }

    switch (event.type) {
      case "tool_approval_requested":
        return;
      case "tool_started":
      case "tool_approved":
      case "tool_rejected":
      case "tool_completed":
      case "tool_failed":
        await this.emit({
          type: "tool_status",
          runId: rootRunId,
          toolName: event.toolName,
          summary: event.summary,
          status: event.type.replace("tool_", "") as
            | "started"
            | "approved"
            | "rejected"
            | "completed"
            | "failed",
          ...(event.type === "tool_failed" ? { error: event.error } : {}),
          timestamp: new Date().toISOString(),
        });
        return;
      case "run_started":
      case "run_completed":
      case "run_aborted":
      case "run_timed_out":
      case "run_failed":
        await this.emit({
          type: "agent_status",
          runId: rootRunId,
          agentRunId: event.runId,
          agentType: event.agentType,
          status: event.type.replace("run_", "") as
            | "started"
            | "completed"
            | "aborted"
            | "timed_out"
            | "failed",
          ...(event.type === "run_failed" ? { error: event.error } : {}),
          timestamp: new Date().toISOString(),
        });
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

  private clearFailedRunCheckpoints(threadId: string): void {
    try {
      SqliteStore.clearThreadCheckpoints(threadId);
    } catch {
      // Best-effort cleanup only. The original run error should remain visible.
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

  private async emit(event: ApplicationEvent): Promise<void> {
    await Promise.allSettled(
      [...this.subscribers].map((subscriber) => subscriber(event)),
    );
  }
}
