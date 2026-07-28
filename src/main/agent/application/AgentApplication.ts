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
  StartRunRequest,
} from "./contracts.ts";
import type { AgentRunner } from "./ports.ts";
import type { ApplicationEventRecorder } from "./runPorts.ts";

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

  startRun(request: StartRunRequest): string {
    if (!this.acceptingRuns) {
      throw new Error("Agent application is shutting down.");
    }
    const threadId = request.threadId.trim();
    const input = request.input.trim();

    if (!threadId) {
      throw new Error("Thread id is required.");
    }
    if (!input) {
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
    const promise = this.executeRun(runId, threadId, input, startedAt);
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
        this.restoreCheckpoints(run.checkpointSnapshot);
      }

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
      this.evictSettledRuns();
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
          ...(event.type === "run_started" ? {
            threadId: event.threadId,
            ...(event.parentRunId ? { parentRunId: event.parentRunId } : {}),
            depth: event.depth,
          } : {}),
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

  private async emit(event: ApplicationEvent): Promise<void> {
    if (this.options.eventRecorder) {
      await Promise.allSettled([this.options.eventRecorder.record(event)]);
    }
    await Promise.allSettled(
      [...this.subscribers].map((subscriber) => subscriber(event)),
    );
  }
}
