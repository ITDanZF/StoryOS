import Database, {
  type Database as BetterSqliteDatabase,
} from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { getAgentHome } from "../workspace/path.ts";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

type CheckpointRow = {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
  readonly parent_checkpoint_id: string | null;
  readonly type: string | null;
  readonly checkpoint: Buffer;
  readonly metadata: Buffer;
};

type WriteRow = {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
  readonly task_id: string;
  readonly idx: number;
  readonly channel: string;
  readonly type: string | null;
  readonly value: Buffer;
};

export type ThreadCheckpointSnapshot = {
  readonly threadId: string;
  readonly checkpoints: readonly CheckpointRow[];
  readonly writes: readonly WriteRow[];
};

export default class SqliteStore {
  private readonly db: BetterSqliteDatabase;
  private readonly checkPointer: SqliteSaver;

  constructor(dbPath = path.join(getAgentHome(), "sessions", "memory.sqlite")) {
    mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint BLOB,
        metadata BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );
      CREATE TABLE IF NOT EXISTS writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        value BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      );
    `);
    this.checkPointer = new SqliteSaver(this.db);
  }

  getCheckpointer() {
    return this.checkPointer;
  }

  close() {
    this.db.close();
  }

  static captureThreadCheckpoints(
    threadId: string,
    dbPath = path.join(getAgentHome(), "sessions", "memory.sqlite"),
  ): ThreadCheckpointSnapshot {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const threadPattern = `${threadId}/%`;
      const checkpoints = db.prepare(
        "SELECT * FROM checkpoints WHERE thread_id = ? OR thread_id LIKE ?",
      ).all(threadId, threadPattern) as CheckpointRow[];
      const writes = db.prepare(
        "SELECT * FROM writes WHERE thread_id = ? OR thread_id LIKE ?",
      ).all(threadId, threadPattern) as WriteRow[];
      return Object.freeze({
        threadId,
        checkpoints: Object.freeze(checkpoints),
        writes: Object.freeze(writes),
      });
    } finally {
      db.close();
    }
  }

  static restoreThreadCheckpoints(
    snapshot: ThreadCheckpointSnapshot,
    dbPath = path.join(getAgentHome(), "sessions", "memory.sqlite"),
  ): number {
    const db = new Database(dbPath);
    try {
      const threadPattern = `${snapshot.threadId}/%`;
      const deleteWrites = db.prepare(
        "DELETE FROM writes WHERE thread_id = ? OR thread_id LIKE ?",
      );
      const deleteCheckpoints = db.prepare(
        "DELETE FROM checkpoints WHERE thread_id = ? OR thread_id LIKE ?",
      );
      const insertCheckpoint = db.prepare(`
        INSERT INTO checkpoints (
          thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
          type, checkpoint, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertWrite = db.prepare(`
        INSERT INTO writes (
          thread_id, checkpoint_ns, checkpoint_id, task_id,
          idx, channel, type, value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      return db.transaction(() => {
        let changes = deleteWrites.run(
          snapshot.threadId,
          threadPattern,
        ).changes;
        changes += deleteCheckpoints.run(
          snapshot.threadId,
          threadPattern,
        ).changes;

        for (const row of snapshot.checkpoints) {
          changes += insertCheckpoint.run(
            row.thread_id,
            row.checkpoint_ns,
            row.checkpoint_id,
            row.parent_checkpoint_id,
            row.type,
            row.checkpoint,
            row.metadata,
          ).changes;
        }
        for (const row of snapshot.writes) {
          changes += insertWrite.run(
            row.thread_id,
            row.checkpoint_ns,
            row.checkpoint_id,
            row.task_id,
            row.idx,
            row.channel,
            row.type,
            row.value,
          ).changes;
        }
        return changes;
      })();
    } finally {
      db.close();
    }
  }

  static clearThreadCheckpoints(
    threadId: string,
    dbPath = path.join(getAgentHome(), "sessions", "memory.sqlite"),
  ): number {
    const db = new Database(dbPath);
    try {
      const tableCount = db.prepare(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('checkpoints', 'writes')",
      ).get() as { count: number };
      if (tableCount.count < 2) {
        return 0;
      }

      const threadPattern = `${threadId}/%`;
      const deleteWrites = db.prepare(
        "DELETE FROM writes WHERE thread_id = ? OR thread_id LIKE ?",
      );
      const deleteCheckpoints = db.prepare(
        "DELETE FROM checkpoints WHERE thread_id = ? OR thread_id LIKE ?",
      );
      const transaction = db.transaction(() => {
        const writes = deleteWrites.run(threadId, threadPattern).changes;
        const checkpoints = deleteCheckpoints.run(
          threadId,
          threadPattern,
        ).changes;
        return writes + checkpoints;
      });

      return transaction();
    } finally {
      db.close();
    }
  }
}
