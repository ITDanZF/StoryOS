import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  ApplicationEvent,
  RunSnapshot,
  RunStatus,
} from "../../application/contracts.ts";
import type { RunHistoryStore } from "../../application/runPorts.ts";

const DEFAULT_MAX_RUNS = 500;

type RunRow = {
  readonly id: string;
  readonly thread_id: string;
  readonly status: RunStatus;
  readonly started_at: number;
  readonly completed_at: number | null;
  readonly duration_ms: number | null;
  readonly output: string | null;
  readonly error_name: string | null;
  readonly error_message: string | null;
};

export default class SqliteRunStore implements RunHistoryStore {
  constructor(
    private readonly database: BetterSqliteDatabase,
    private readonly maxRuns = DEFAULT_MAX_RUNS,
  ) {
    if (!Number.isInteger(maxRuns) || maxRuns <= 0) {
      throw new Error("maxRuns must be a positive integer.");
    }
    this.recoverInterruptedRuns();
  }

  async record(event: ApplicationEvent): Promise<void> {
    if (event.type === "run_started") {
      this.database.prepare(`
        INSERT INTO agent_runs(id, thread_id, status, started_at)
        VALUES (?, ?, 'running', ?)
        ON CONFLICT(id) DO UPDATE SET
          thread_id = excluded.thread_id,
          status = 'running',
          started_at = excluded.started_at,
          completed_at = NULL,
          duration_ms = NULL,
          output = NULL,
          error_name = NULL,
          error_message = NULL
      `).run(event.runId, event.threadId, Date.parse(event.timestamp));
      return;
    }

    if (event.type === "run_completed") {
      this.finishRun(event.runId, "completed", event.timestamp, event.durationMs, {
        output: event.content,
      });
      this.prune();
      return;
    }

    if (["run_aborted", "run_timed_out", "run_failed"].includes(event.type)) {
      const terminal = event as Extract<ApplicationEvent, {
        readonly type: "run_aborted" | "run_timed_out" | "run_failed";
      }>;
      this.finishRun(
        terminal.runId,
        terminal.type.replace("run_", "") as RunStatus,
        terminal.timestamp,
        terminal.durationMs,
        {
          errorName: terminal.error.name,
          errorMessage: terminal.error.message,
        },
      );
      this.prune();
    }
  }

  async loadRunSnapshots(limit = this.maxRuns): Promise<readonly RunSnapshot[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("Run history limit must be a non-negative integer.");
    }
    const rows = this.database.prepare(`
      SELECT * FROM agent_runs
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `).all(limit) as RunRow[];
    return Object.freeze(rows.map((row) => this.toSnapshot(row)));
  }

  private recoverInterruptedRuns(): void {
    const now = Date.now();
    this.database.prepare(`
      UPDATE agent_runs
      SET status = 'aborted',
          completed_at = ?,
          duration_ms = MAX(0, ? - started_at),
          error_name = 'RunInterruptedError',
          error_message = 'Application exited before the run completed.'
      WHERE status IN ('queued', 'running', 'cancelling')
    `).run(now, now);
  }

  private finishRun(
    runId: string,
    status: RunStatus,
    completedAt: string,
    durationMs: number,
    result: {
      readonly output?: string;
      readonly errorName?: string;
      readonly errorMessage?: string;
    },
  ): void {
    this.database.prepare(`
      UPDATE agent_runs
      SET status = ?, completed_at = ?, duration_ms = ?, output = ?,
          error_name = ?, error_message = ?
      WHERE id = ?
    `).run(
      status,
      Date.parse(completedAt),
      durationMs,
      result.output ?? null,
      result.errorName ?? null,
      result.errorMessage ?? null,
      runId,
    );
  }

  private prune(): void {
    this.database.prepare(`
      DELETE FROM agent_runs
      WHERE status NOT IN ('queued', 'running', 'cancelling')
        AND id NOT IN (
          SELECT id FROM agent_runs
          WHERE status NOT IN ('queued', 'running', 'cancelling')
          ORDER BY started_at DESC, id DESC
          LIMIT ?
        )
    `).run(this.maxRuns);
  }

  private toSnapshot(row: RunRow): RunSnapshot {
    return Object.freeze({
      runId: row.id,
      threadId: row.thread_id,
      status: row.status,
      startedAt: new Date(row.started_at).toISOString(),
      ...(row.completed_at === null
        ? {}
        : { completedAt: new Date(row.completed_at).toISOString() }),
      ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
      ...(row.output === null ? {} : { content: row.output }),
      ...(row.error_name === null || row.error_message === null
        ? {}
        : { error: Object.freeze({
            name: row.error_name,
            message: row.error_message,
          }) }),
    });
  }
}
