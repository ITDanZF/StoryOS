import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ProjectDatabase from "../../src/main/story/storage/project/ProjectDatabase.ts";
import SqliteThreadStore from "../../src/main/story/storage/project/SqliteThreadStore.ts";
import ThreadApplication from "../../src/main/story/application/conversations/ThreadApplication.ts";
import SqliteRunStore from "../../src/main/story/storage/project/SqliteRunStore.ts";
import SqliteConversationEventStore from "../../src/main/story/storage/project/SqliteConversationEventStore.ts";
import SqliteApplicationEventRecorder from "../../src/main/story/storage/project/SqliteApplicationEventRecorder.ts";
import type { ApplicationEvent } from "../../src/shared/contracts/conversations/applicationContracts.ts";

describe("atomic terminal recording and restart recovery", () => {
  it("rolls back both terminal projections, then records one interrupted message across restarts", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "storyos-terminal-"));
    const file = path.join(root, "project.sqlite");
    let database = new ProjectDatabase(file);
    try {
      const threads = new ThreadApplication(new SqliteThreadStore(database.handle));
      const thread = threads.createThread({ title: "Recovery" });
      const runs = new SqliteRunStore(database.handle);
      const events = new SqliteConversationEventStore(database.handle);
      const recorder = new SqliteApplicationEventRecorder(database.handle, runs, events);
      const timestamp = new Date().toISOString();
      await recorder.record({ type: "run_started", runId: "run", threadId: thread.id, timestamp });
      const terminal: ApplicationEvent = {
        type: "turn.completed",
        eventId: "end",
        sequence: 1,
        runId: "run",
        threadId: thread.id,
        timestamp,
        payload: { content: "answer", durationMs: 1 },
      };
      database.handle.exec(
        "CREATE TRIGGER fail_terminal BEFORE UPDATE ON agent_runs WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'disk failure'); END;",
      );
      await expect(
        recorder.recordBatch([
          terminal,
          { type: "run_completed", runId: "run", timestamp, content: "answer", durationMs: 1 },
        ]),
      ).rejects.toMatchObject({ code: "event.persistence_failed" });
      expect(await events.listByThread(thread.id)).toHaveLength(0);
      expect((await runs.loadRunSnapshots())[0].status).toBe("running");
      database.handle.exec("DROP TRIGGER fail_terminal");
      database.close();
      database = new ProjectDatabase(file);
      const recovered = new SqliteRunStore(database.handle);
      expect((await recovered.loadRunSnapshots())[0].status).toBe("aborted");
      const recoveredEvents = new SqliteConversationEventStore(database.handle);
      expect((await recoveredEvents.listByThread(thread.id)).map((e) => e.type)).toEqual([
        "turn.failed",
      ]);
      new SqliteRunStore(database.handle);
      expect(await recoveredEvents.listByThread(thread.id)).toHaveLength(1);
      expect(
        database.handle.prepare("SELECT status FROM message_views WHERE id=?").get("run:assistant"),
      ).toEqual({ status: "failed" });
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
