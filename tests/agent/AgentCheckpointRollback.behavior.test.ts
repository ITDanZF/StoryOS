import { describe, expect, it, vi } from "vitest";

type FakeCheckpointRow = {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  type: string | null;
  checkpoint: Buffer;
  metadata: Buffer;
};

type FakeWriteRow = {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  task_id: string;
  idx: number;
  channel: string;
  type: string | null;
  value: Buffer;
};

type FakeDatabaseState = {
  checkpoints: FakeCheckpointRow[];
  writes: FakeWriteRow[];
};

const sqliteState = vi.hoisted(() => ({
  databases: new Map<string, FakeDatabaseState>(),
}));

function belongsToThreadTree(threadId: string, rootThreadId: string): boolean {
  return threadId === rootThreadId || threadId.startsWith(`${rootThreadId}/`);
}

vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {
    private readonly state: FakeDatabaseState;

    constructor(private readonly dbPath: string) {
      const existing = sqliteState.databases.get(dbPath);
      this.state = existing ?? { checkpoints: [], writes: [] };
      sqliteState.databases.set(dbPath, this.state);
    }

    pragma(): undefined {
      return undefined;
    }

    exec(): undefined {
      return undefined;
    }

    close(): undefined {
      return undefined;
    }

    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      return {
        all: (rootThreadId: string) => {
          if (normalized.startsWith("SELECT * FROM checkpoints")) {
            return this.state.checkpoints
              .filter((row) => belongsToThreadTree(row.thread_id, rootThreadId))
              .map((row) => ({ ...row }));
          }
          if (normalized.startsWith("SELECT * FROM writes")) {
            return this.state.writes
              .filter((row) => belongsToThreadTree(row.thread_id, rootThreadId))
              .map((row) => ({ ...row }));
          }
          throw new Error(`Unsupported fake SELECT: ${normalized}`);
        },
        run: (...args: unknown[]) => {
          if (normalized.startsWith("DELETE FROM writes")) {
            const rootThreadId = String(args[0]);
            const before = this.state.writes.length;
            this.state.writes = this.state.writes.filter(
              (row) => !belongsToThreadTree(row.thread_id, rootThreadId),
            );
            return { changes: before - this.state.writes.length };
          }
          if (normalized.startsWith("DELETE FROM checkpoints")) {
            const rootThreadId = String(args[0]);
            const before = this.state.checkpoints.length;
            this.state.checkpoints = this.state.checkpoints.filter(
              (row) => !belongsToThreadTree(row.thread_id, rootThreadId),
            );
            return { changes: before - this.state.checkpoints.length };
          }
          if (normalized.startsWith("INSERT INTO checkpoints")) {
            this.state.checkpoints.push({
              thread_id: String(args[0]),
              checkpoint_ns: String(args[1]),
              checkpoint_id: String(args[2]),
              parent_checkpoint_id: args[3] === null ? null : String(args[3]),
              type: args[4] === null ? null : String(args[4]),
              checkpoint: args[5] as Buffer,
              metadata: args[6] as Buffer,
            });
            return { changes: 1 };
          }
          if (normalized.startsWith("INSERT INTO writes")) {
            this.state.writes.push({
              thread_id: String(args[0]),
              checkpoint_ns: String(args[1]),
              checkpoint_id: String(args[2]),
              task_id: String(args[3]),
              idx: Number(args[4]),
              channel: String(args[5]),
              type: args[6] === null ? null : String(args[6]),
              value: args[7] as Buffer,
            });
            return { changes: 1 };
          }
          throw new Error(`Unsupported fake statement: ${normalized}`);
        },
      };
    }

    transaction<T>(operation: () => T): () => T {
      return () => operation();
    }
  },
}));

import AgentApplication from "../../src/main/agent/application/AgentApplication.ts";
import type { AgentRunner } from "../../src/main/agent/application/ports.ts";

function runRequest(threadId: string, content: string) {
  return {
    threadId,
    message: { messageId: `message-${threadId}-${content}`, content },
  };
}

function checkpoint(
  threadId: string,
  checkpointId: string,
  marker: string,
): FakeCheckpointRow {
  return {
    thread_id: threadId,
    checkpoint_ns: "",
    checkpoint_id: checkpointId,
    parent_checkpoint_id: null,
    type: "json",
    checkpoint: Buffer.from(`checkpoint:${marker}`),
    metadata: Buffer.from(`metadata:${marker}`),
  };
}

function write(
  threadId: string,
  checkpointId: string,
  marker: string,
): FakeWriteRow {
  return {
    thread_id: threadId,
    checkpoint_ns: "",
    checkpoint_id: checkpointId,
    task_id: `task:${marker}`,
    idx: 0,
    channel: "messages",
    type: "json",
    value: Buffer.from(`write:${marker}`),
  };
}

function snapshotState(state: FakeDatabaseState) {
  return {
    checkpoints: state.checkpoints
      .map((row) => ({
        ...row,
        checkpoint: row.checkpoint.toString(),
        metadata: row.metadata.toString(),
      }))
      .sort((left, right) =>
        `${left.thread_id}:${left.checkpoint_id}`.localeCompare(
          `${right.thread_id}:${right.checkpoint_id}`,
        )),
    writes: state.writes
      .map((row) => ({
        ...row,
        value: row.value.toString(),
      }))
      .sort((left, right) =>
        `${left.thread_id}:${left.checkpoint_id}:${left.task_id}`.localeCompare(
          `${right.thread_id}:${right.checkpoint_id}:${right.task_id}`,
        )),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe("Agent checkpoint rollback behavior", () => {
  it("restores the previous thread tree after a failed run", async () => {
    const checkpointPath = "checkpoint-test.sqlite";
    const state: FakeDatabaseState = {
      checkpoints: [
        checkpoint("thread-a", "checkpoint-old", "old-root"),
        checkpoint(
          "thread-a/agents/text-analyzer/run-old",
          "checkpoint-old-child",
          "old-child",
        ),
        checkpoint("thread-b", "checkpoint-sibling", "sibling"),
      ],
      writes: [
        write("thread-a", "checkpoint-old", "old-root"),
        write(
          "thread-a/agents/text-analyzer/run-old",
          "checkpoint-old-child",
          "old-child",
        ),
        write("thread-b", "checkpoint-sibling", "sibling"),
      ],
    };
    sqliteState.databases.set(checkpointPath, state);
    const before = snapshotState(state);
    const runner: AgentRunner = {
      run: async () => {
        state.checkpoints.push(
          checkpoint("thread-a", "checkpoint-failed", "failed-root"),
          checkpoint(
            "thread-a/agents/text-reviewer/run-failed",
            "checkpoint-failed-child",
            "failed-child",
          ),
        );
        state.writes.push(
          write("thread-a", "checkpoint-failed", "failed-root"),
          write(
            "thread-a/agents/text-reviewer/run-failed",
            "checkpoint-failed-child",
            "failed-child",
          ),
        );
        throw new Error("model failed");
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner, { checkpointPath });

    const runId = application.startRun(
      runRequest("thread-a", "run a failing task"),
    );

    await expect(application.waitForRun(runId)).rejects.toThrow("model failed");
    expect(snapshotState(state)).toEqual(before);
  });

  it("allows only one active run per thread while keeping threads independent", async () => {
    const first = deferred<string>();
    const other = deferred<string>();
    const next = deferred<string>();
    const runs = new Map([
      ["first", first.promise],
      ["other", other.promise],
      ["next", next.promise],
    ]);
    const runner: AgentRunner = {
      run: (input) => runs.get(input.message.content)
        ?? Promise.reject(new Error("Unknown run")),
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner);

    const firstRunId = application.startRun(runRequest("thread-a", "first"));
    expect(() =>
      application.startRun(runRequest("thread-a", "duplicate")),
    ).toThrow("Thread already has an active run");

    const otherRunId = application.startRun(runRequest("thread-b", "other"));
    first.resolve("first done");
    other.resolve("other done");
    await expect(application.waitForRun(firstRunId)).resolves.toBe("first done");
    await expect(application.waitForRun(otherRunId)).resolves.toBe("other done");

    const nextRunId = application.startRun(runRequest("thread-a", "next"));
    next.resolve("next done");
    await expect(application.waitForRun(nextRunId)).resolves.toBe("next done");
  });
});
