import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectApplication from "../../src/main/story/application/projects/ProjectApplication.ts";
import WorkspaceRuntimeManager from "../../src/main/story/runtime/WorkspaceRuntimeManager.ts";
import { getWorkspaceLayout } from "../../src/main/story/workspace/ProjectLayout.ts";
import ProjectDatabase from "../../src/main/story/storage/project/ProjectDatabase.ts";
import SqliteRunStore from "../../src/main/story/storage/project/SqliteRunStore.ts";
import SqliteThreadStore from "../../src/main/story/storage/project/SqliteThreadStore.ts";
import ApplicationDatabase from "../../src/main/story/storage/global/ApplicationDatabase.ts";
import SqliteProjectStore from "../../src/main/story/storage/global/SqliteProjectStore.ts";
import SqliteBookStore from "../../src/main/story/storage/global/SqliteBookStore.ts";
import type { ModelConnectionConfiguration } from "../../src/main/agent/model/ModelConfiguration.ts";

const memoryState = vi.hoisted(() => ({
  close: vi.fn(),
}));

vi.mock("../../src/main/agent/checkpoints/index.ts", () => ({
  default: class FakeMemory {
    getCheckpointer(): unknown {
      return undefined;
    }

    getConfig(threadId: string) {
      return { configurable: { thread_id: threadId } };
    }

    close() {
      memoryState.close();
    }
  },
}));

const roots: string[] = [];
const applicationDatabases: ApplicationDatabase[] = [];
const modelConfiguration: ModelConnectionConfiguration = Object.freeze({
  modelName: "test-model",
  apiKey: "test-key",
  baseUrl: "https://example.test/v1",
});

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-runtime-"));
  roots.push(root);
  const agentHome = path.join(root, ".mini-agent");
  const defaultRoot = path.join(agentHome, "workSpaceRoot");
  mkdirSync(defaultRoot, { recursive: true });
  writeFileSync(
    path.join(agentHome, "config.json"),
    JSON.stringify({ AGENT_WORKSPACE: "" }),
    "utf8",
  );
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  vi.stubEnv("MINI_AGENT_BUNDLED_SKILLS", path.join(process.cwd(), "skills"));
  const applicationDatabase = new ApplicationDatabase(agentHome);
  applicationDatabases.push(applicationDatabase);
  const projects = new ProjectApplication(new SqliteProjectStore(applicationDatabase.handle));
  const books = new SqliteBookStore(applicationDatabase.handle);
  const parentPath = path.join(root, "projects");
  mkdirSync(parentPath);
  const project = projects.createProject({ name: "Stable Story", parentPath });
  return { agentHome, books, project, projects, root };
}

afterEach(() => {
  vi.unstubAllEnvs();
  memoryState.close.mockClear();
  for (const database of applicationDatabases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("WorkspaceRuntimeManager behavior", () => {
  it("applies a new model to global, active and future project gateways while retaining runtime state", async () => {
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { model } = JSON.parse(body) as { model: string };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id: "test",
          object: "chat.completion",
          created: 1,
          model,
          choices: [
            { index: 0, message: { role: "assistant", content: model }, finish_reason: "stop" },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    const config = { ...modelConfiguration, baseUrl: `http://127.0.0.1:${address.port}/v1` };
    const { agentHome, books, project, projects, root } = createHarness();
    let manager: WorkspaceRuntimeManager | undefined;
    try {
      manager = await WorkspaceRuntimeManager.create(projects, books, agentHome, config);
      const global = await manager.resolve({ kind: "global" });
      const active = await manager.resolve({ kind: "project", projectId: project.id });
      const threadSnapshot = active.threads.getSnapshot();
      manager.prepareModelConfiguration({ ...config, modelName: "updated-model" })();
      expect(await manager.resolve({ kind: "global" })).toBe(global);
      expect(await manager.resolve({ kind: "project", projectId: project.id })).toBe(active);
      expect(active.threads.getSnapshot()).toEqual(threadSnapshot);
      const input = { prompt: "test", threadId: "test", systemPrompt: "test", tools: [] as [] };
      expect(await global.model.invokeText(input)).toBe("updated-model");
      expect(await active.model.invokeText(input)).toBe("updated-model");
      const another = projects.createProject({
        name: "Another",
        parentPath: path.join(root, "projects"),
      });
      const next = await manager.resolve({ kind: "project", projectId: another.id });
      expect(await next.model.invokeText(input)).toBe("updated-model");
    } finally {
      await manager?.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("keeps the current runtime when activation fails before building a replacement", async () => {
    const { agentHome, books, project, projects, root } = createHarness();
    const manager = await WorkspaceRuntimeManager.create(
      projects,
      books,
      agentHome,
      modelConfiguration,
    );

    await expect(manager.activate(path.join(root, "missing-project"))).rejects.toThrow(
      "Project not found",
    );

    expect(manager.activeProjectPath).toBe(project.path);
    expect(manager.threads.getSnapshot()).toMatchObject({
      activeThread: { title: "新对话" },
      threads: [{ title: "新对话" }],
    });
    expect(manager.novels.getProjectBook()).toBeNull();
    await manager.close();
  });

  it("closes partially created model sessions when runtime creation fails", async () => {
    const { agentHome, books, projects, root } = createHarness();
    vi.stubEnv("MINI_AGENT_BUNDLED_SKILLS", path.join(root, "missing-bundled-skills"));
    memoryState.close.mockClear();

    await expect(
      WorkspaceRuntimeManager.create(projects, books, agentHome, modelConfiguration),
    ).rejects.toThrow("Bundled skill root does not exist");

    expect(memoryState.close).toHaveBeenCalledTimes(1);
  });
  it("restores persisted run history when a workspace is activated", async () => {
    const { agentHome, books, project, projects } = createHarness();
    const projectDatabase = new ProjectDatabase(
      getWorkspaceLayout(project.path).projectDatabasePath,
    );
    const threadStore = new SqliteThreadStore(projectDatabase.handle);
    threadStore.createThread("Restored", "thread-restored");
    const logs = new SqliteRunStore(projectDatabase.handle);
    await logs.record({
      type: "run_started",
      runId: "run-restored",
      threadId: "thread-restored",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    await logs.record({
      type: "run_completed",
      runId: "run-restored",
      content: "not persisted",
      durationMs: 50,
      timestamp: "2026-01-01T00:00:00.050Z",
    });
    projectDatabase.close();

    const manager = await WorkspaceRuntimeManager.create(
      projects,
      books,
      agentHome,
      modelConfiguration,
    );

    expect(manager.agent.listRuns()).toEqual([
      expect.objectContaining({
        runId: "run-restored",
        threadId: "thread-restored",
        status: "completed",
      }),
    ]);
    await manager.close();
  });

  it("shuts down workspace resources only once", async () => {
    const { agentHome, books, projects } = createHarness();
    const manager = await WorkspaceRuntimeManager.create(
      projects,
      books,
      agentHome,
      modelConfiguration,
    );
    memoryState.close.mockClear();

    await manager.shutdown();
    await manager.shutdown();

    expect(memoryState.close).toHaveBeenCalledTimes(2);
  });

  it("keeps global and project conversations in independent runtimes", async () => {
    const { agentHome, books, project, projects } = createHarness();
    const manager = await WorkspaceRuntimeManager.create(
      projects,
      books,
      agentHome,
      modelConfiguration,
    );

    const globalRuntime = await manager.resolve({ kind: "global" });
    const globalThread = globalRuntime.threads.createThread({
      title: "Global ideas",
    });
    expect(manager.activeProjectPath).toBe(project.path);

    const projectRuntime = await manager.resolve({
      kind: "project",
      projectId: project.id,
    });
    expect(projectRuntime.novels.getProjectBook()).toBeNull();
    const projectThread = projectRuntime.threads.createThread({
      title: "Book discussion",
    });

    expect(globalRuntime.threads.getSnapshot().threads.map((thread) => thread.id)).toEqual([
      globalThread.id,
    ]);
    expect(projectRuntime.threads.getSnapshot().threads.map((thread) => thread.id)).toEqual(
      expect.arrayContaining([projectThread.id]),
    );
    expect(projectRuntime.threads.getSnapshot().threads).toHaveLength(2);
    expect(globalRuntime).not.toBe(projectRuntime);
    await manager.close();
  });

  it("creates and reopens project books from the independent book database", async () => {
    const { agentHome, books, project, projects } = createHarness();
    const manager = await WorkspaceRuntimeManager.create(
      projects,
      books,
      agentHome,
      modelConfiguration,
    );
    const runtime = await manager.resolve({
      kind: "project",
      projectId: project.id,
    });
    const novel = runtime.novels.createNovel({ title: "Independent Book" });
    const registered = books.getBookForProject(project.id);

    expect(registered?.id).toMatch(/^book_/);
    expect(registered?.storagePath).toContain(path.join("library", "books"));
    await manager.close();

    const reopened = await WorkspaceRuntimeManager.create(
      projects,
      books,
      agentHome,
      modelConfiguration,
    );
    expect(reopened.novels.getProjectBook()).toEqual(novel);
    await reopened.close();
  });
});
