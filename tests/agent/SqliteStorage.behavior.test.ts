import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ThreadApplication from "../../src/main/agent/application/ThreadApplication.ts";
import ApplicationDatabase from "../../src/main/agent/storage/global/ApplicationDatabase.ts";
import SqliteProjectStore from "../../src/main/agent/storage/global/SqliteProjectStore.ts";
import ProjectDatabase from "../../src/main/agent/storage/project/ProjectDatabase.ts";
import SqliteRunStore from "../../src/main/agent/storage/project/SqliteRunStore.ts";
import SqliteThreadStore from "../../src/main/agent/storage/project/SqliteThreadStore.ts";

const temporaryRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-sqlite-storage-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("SQLite storage", () => {
  it("preserves an empty conversation workspace without creating a placeholder thread", () => {
    const root = createRoot();
    const databasePath = path.join(root, ".storyos", "storyos.sqlite");
    const database = new ProjectDatabase(databasePath);
    const threads = new ThreadApplication(
      new SqliteThreadStore(database.handle),
    );

    expect(threads.getSnapshot()).toEqual({
      activeThreadId: null,
      activeThread: null,
      threads: [],
    });
    const created = threads.createThread({ title: "Temporary" });
    expect(threads.deleteThread(created.id)).toEqual({
      activeThreadId: null,
      activeThread: null,
      threads: [],
    });
    database.close();

    const reopened = new ProjectDatabase(databasePath);
    expect(new ThreadApplication(
      new SqliteThreadStore(reopened.handle),
    ).getSnapshot()).toEqual({
      activeThreadId: null,
      activeThread: null,
      threads: [],
    });
    reopened.close();
  });

  it("persists the global project registry and active project", () => {
    const root = createRoot();
    const database = new ApplicationDatabase(root);
    const projects = new SqliteProjectStore(database.handle);
    const originalPath = path.join(root, "Novel");
    const renamedPath = path.join(root, "Renamed");

    const project = projects.upsertProject({
      id: "prj-storage",
      path: originalPath,
      name: "Novel",
      locationType: "created",
    });
    projects.setActiveProjectId(project.id);
    const renamed = projects.renameProject(originalPath, renamedPath, "Renamed");

    expect(projects.getActiveProjectId()).toBe(project.id);
    expect(renamed.path).toBe(path.resolve(renamedPath));
    expect(projects.getProject(originalPath)).toBeNull();
    expect(projects.getProject(renamedPath)?.id).toBe(project.id);
    database.close();

    const reopened = new ApplicationDatabase(root);
    const reopenedProjects = new SqliteProjectStore(reopened.handle);
    expect(reopenedProjects.getActiveProjectId()).toBe(project.id);
    expect(reopenedProjects.listProjects()).toHaveLength(1);
    reopened.close();
  });

  it("persists active threads, ordered messages, and normalized skill state", () => {
    const root = createRoot();
    const databasePath = path.join(root, ".storyos", "storyos.sqlite");
    const database = new ProjectDatabase(databasePath);
    const threads = new ThreadApplication(new SqliteThreadStore(database.handle));
    const created = threads.createThread({ title: "Draft" });

    threads.appendMessage({
      threadId: created.id,
      role: "user",
      content: "first",
    });
    threads.appendMessage({
      threadId: created.id,
      role: "assistant",
      content: "second",
    });
    threads.useSkill(" plot ", created.id);
    threads.disableSkill("style", created.id);

    expect(threads.listMessages(created.id).map((message) => message.content))
      .toEqual(["first", "second"]);
    expect(threads.getThreadSkillState(created.id)).toEqual({
      activeSkillIds: ["plot"],
      disabledSkillIds: ["style"],
    });
    database.close();

    const reopened = new ProjectDatabase(databasePath);
    const restored = new ThreadApplication(
      new SqliteThreadStore(reopened.handle),
    );
    expect(restored.getActiveThreadId()).toBe(created.id);
    expect(restored.listMessages(created.id)).toHaveLength(2);
    reopened.close();
  });

  it("derives and persists a title from the first user prompt", () => {
    const root = createRoot();
    const databasePath = path.join(root, ".storyos", "storyos.sqlite");
    const database = new ProjectDatabase(databasePath);
    const threads = new ThreadApplication(new SqliteThreadStore(database.handle));
    const created = threads.createThread({ title: "新对话" });

    threads.appendMessage({
      threadId: created.id,
      role: "user",
      content: "请帮我检查第五章的节奏，并给出三条建议。",
    });
    expect(threads.getSnapshot().activeThread?.title)
      .toBe("检查第五章的节奏，并给出三条建议");

    threads.appendMessage({
      threadId: created.id,
      role: "user",
      content: "这个标题不应该再次变化",
    });
    expect(threads.getSnapshot().activeThread?.title)
      .toBe("检查第五章的节奏，并给出三条建议");
    database.close();

    const reopened = new ProjectDatabase(databasePath);
    expect(new ThreadApplication(
      new SqliteThreadStore(reopened.handle),
    ).getSnapshot().activeThread?.title)
      .toBe("检查第五章的节奏，并给出三条建议");
    reopened.close();
  });

  it("restores run summaries and aborts interrupted runs", async () => {
    const root = createRoot();
    const database = new ProjectDatabase(
      path.join(root, ".storyos", "storyos.sqlite"),
    );
    const threads = new SqliteThreadStore(database.handle);
    threads.createThread("Run thread", "thread-run");
    const runs = new SqliteRunStore(database.handle);

    await runs.record({
      type: "run_started",
      runId: "run-interrupted",
      threadId: "thread-run",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const recovered = new SqliteRunStore(database.handle);
    expect((await recovered.loadRunSnapshots())[0]).toMatchObject({
      runId: "run-interrupted",
      status: "aborted",
      error: { name: "RunInterruptedError" },
    });
    database.close();
  });
});
