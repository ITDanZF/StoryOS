import type {
  RunSnapshot,
  RunStatus,
  SerializableError,
} from "../../../../../shared/contracts/conversations/applicationContracts.ts";
import type { ThreadCheckpointSnapshot } from "../../../../agent/checkpoints/CheckpointRecovery.ts";
export type RunRecord = {
  promise: Promise<string> | null;
  readonly threadId: string;
  readonly startedAt: string;
  readonly checkpointSnapshot: ThreadCheckpointSnapshot | null;
  status: RunStatus;
  completedAt?: string;
  durationMs?: number;
  content?: string;
  error?: SerializableError;
  cancelError: Error | null;
  settled: boolean;
};
export default class RunStateStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly active = new Map<string, string>();
  constructor(
    initialRuns: readonly RunSnapshot[] = [],
    private readonly maxRetainedRuns = 100,
  ) {
    if (!Number.isInteger(maxRetainedRuns) || maxRetainedRuns < 0)
      throw new Error("maxRetainedRuns must be a non-negative integer.");
    for (const snapshot of [...initialRuns].reverse()) {
      this.runs.set(snapshot.runId, {
        promise: null,
        threadId: snapshot.threadId,
        startedAt: snapshot.startedAt,
        checkpointSnapshot: null,
        status: snapshot.status,
        ...(snapshot.completedAt ? { completedAt: snapshot.completedAt } : {}),
        ...(snapshot.durationMs !== undefined ? { durationMs: snapshot.durationMs } : {}),
        ...(snapshot.content !== undefined ? { content: snapshot.content } : {}),
        ...(snapshot.error ? { error: snapshot.error } : {}),
        cancelError: null,
        settled: true,
      });
    }
    this.evictSettledRuns();
  }
  get(id: string) {
    return this.runs.get(id);
  }
  set(id: string, record: RunRecord): void {
    this.runs.set(id, record);
  }
  entries() {
    return this.runs.entries();
  }
  get activeCount() {
    return this.active.size;
  }
  activeForThread(id: string) {
    return this.active.get(id);
  }
  markActive(thread: string, run: string): void {
    this.active.set(thread, run);
  }
  clearActive(thread: string): void {
    this.active.delete(thread);
  }
  activeIds() {
    return this.active.values();
  }
  clear(): void {
    this.active.clear();
    this.runs.clear();
  }
  evictSettledRuns(): void {
    const settledRunIds = [...this.runs.entries()]
      .filter(([, run]) => run.settled)
      .map(([runId]) => runId);
    const excess = settledRunIds.length - this.maxRetainedRuns;
    for (const runId of settledRunIds.slice(0, Math.max(0, excess))) {
      this.runs.delete(runId);
    }
  }
  toRunSnapshot(runId: string, run: RunRecord): RunSnapshot {
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
}
