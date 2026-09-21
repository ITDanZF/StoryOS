import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import SqliteStore from "./SqliteStore.ts";

describe("SqliteStore checkpoint pointers", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("captures keys without blobs and restores by deleting newer rows", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "storyos-checkpoint-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "memory.sqlite");
    const store = new SqliteStore(dbPath);
    store.close();

    const db = new Database(dbPath);
    db.prepare(
      `INSERT INTO checkpoints(thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
       VALUES (?, '', ?, NULL, NULL, ?, ?)`,
    ).run("thread-1", "ckpt-1", Buffer.from("keep-blob"), Buffer.from("keep-meta"));
    db.close();

    const snapshot = SqliteStore.captureThreadCheckpoints("thread-1", dbPath);
    expect(snapshot.checkpoints).toEqual([
      { thread_id: "thread-1", checkpoint_ns: "", checkpoint_id: "ckpt-1" },
    ]);
    expect(snapshot.checkpoints[0]).not.toHaveProperty("checkpoint");

    const later = new Database(dbPath);
    later
      .prepare(
        `INSERT INTO checkpoints(thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
         VALUES (?, '', ?, ?, NULL, ?, ?)`,
      )
      .run(
        "thread-1",
        "ckpt-2",
        "ckpt-1",
        Buffer.from("new-blob"),
        Buffer.from("new-meta"),
      );
    later.close();

    const deleted = SqliteStore.restoreThreadCheckpoints(snapshot, dbPath);
    expect(deleted).toBe(1);
    const verify = new Database(dbPath, { readonly: true });
    const rows = verify
      .prepare("SELECT checkpoint_id, checkpoint FROM checkpoints WHERE thread_id = ?")
      .all("thread-1") as Array<{ checkpoint_id: string; checkpoint: Buffer }>;
    verify.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.checkpoint_id).toBe("ckpt-1");
    expect(Buffer.from(rows[0]?.checkpoint ?? []).toString()).toBe("keep-blob");
  });
});
