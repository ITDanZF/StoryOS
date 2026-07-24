import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectApplication from "../../src/main/agent/application/ProjectApplication.ts";
import ProjectJsonStore from "../../src/main/agent/Memory/ProjectJsonStore.ts";
import WorkspaceRuntimeManager from "../../src/main/agent/runtime/WorkspaceRuntimeManager.ts";
import RunLogStore from "../../src/main/agent/runtime/RunLogStore.ts";
import { getWorkspaceLayout } from "../../src/main/agent/workspace/ProjectLayout.ts";
import type { ModelConnectionConfiguration } from "../../src/main/agent/model/ModelConfiguration.ts";

const memoryState = vi.hoisted(() => ({
  close: vi.fn(),
}));

vi.mock("../../src/main/agent/Memory/index.ts", () => ({
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
  writeFileSync(path.join(agentHome, "config.json"), JSON.stringify({ AGENT_WORKSPACE: "" }), "utf8");
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  vi.stubEnv("MINI_AGENT_BUNDLED_SKILLS", path.join(process.cwd(), "skills"));
  const projects = new ProjectApplication(new ProjectJsonStore(path.join(agentHome, "projects.json")));
  const parentPath = path.join(root, "projects");
  mkdirSync(parentPath);
  const project = projects.createProject({ name: "Stable Story", parentPath });
  return { project, projects, root };
}

afterEach(() => {
  vi.unstubAllEnvs();
  memoryState.close.mockClear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("WorkspaceRuntimeManager behavior", () => {
  it("keeps the current runtime when activation fails before building a replacement", async () => {
    const { project, projects, root } = createHarness();
    const manager = await WorkspaceRuntimeManager.create(projects, modelConfiguration);

    await expect(manager.activate(path.join(root, "missing-project")))
      .rejects.toThrow("Project not found");

    expect(manager.activeProjectPath).toBe(project.path);
    expect(manager.threads.getSnapshot().activeThreadId).toBeTruthy();
    await manager.close();
  });

  it("closes partially created model sessions when runtime creation fails", async () => {
    const { projects, root } = createHarness();
    vi.stubEnv("MINI_AGENT_BUNDLED_SKILLS", path.join(root, "missing-bundled-skills"));
    memoryState.close.mockClear();

    await expect(WorkspaceRuntimeManager.create(projects, modelConfiguration))
      .rejects.toThrow("Bundled skill root does not exist");

    expect(memoryState.close).toHaveBeenCalledTimes(1);
  });
  it("restores persisted run history when a workspace is activated", async () => {
    const { project, projects } = createHarness();
    const logs = new RunLogStore(getWorkspaceLayout(project.path).runsRoot);
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
    await logs.close();

    const manager = await WorkspaceRuntimeManager.create(
      projects,
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
    const { projects } = createHarness();
    const manager = await WorkspaceRuntimeManager.create(
      projects,
      modelConfiguration,
    );
    memoryState.close.mockClear();

    await manager.shutdown();
    await manager.shutdown();

    expect(memoryState.close).toHaveBeenCalledTimes(1);
  });

});
