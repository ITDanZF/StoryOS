import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectApplication from "../../src/main/agent/application/ProjectApplication.ts";
import ProjectJsonStore from "../../src/main/agent/Memory/ProjectJsonStore.ts";
import LegacyWorkspaceMigrator from "../../src/main/agent/runtime/LegacyWorkspaceMigrator.ts";
import WorkspaceToolContext from "../../src/main/agent/tools/WorkspaceToolContext.ts";

const roots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-isolation-"));
  roots.push(root);
  const agentHome = path.join(root, ".mini-agent");
  const defaultRoot = path.join(agentHome, "workSpaceRoot");
  mkdirSync(defaultRoot, { recursive: true });
  writeFileSync(path.join(agentHome, "config.json"), JSON.stringify({ AGENT_WORKSPACE: "" }), "utf8");
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  const projects = new ProjectApplication(new ProjectJsonStore(path.join(agentHome, "projects.json")));
  return { root, agentHome, defaultRoot, projects };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("project workspace isolation", () => {
  it("creates a hidden system workspace for unowned conversations", () => {
    const { projects, defaultRoot } = createHarness();
    const snapshot = projects.getSnapshot();
    expect(snapshot.systemWorkspace.path).toBe(path.join(defaultRoot, ".storyos-default"));
    expect(existsSync(path.join(snapshot.systemWorkspace.path, "files"))).toBe(true);
    expect(existsSync(path.join(snapshot.systemWorkspace.path, ".storyos", "conversations", "index.json"))).toBe(false);
  });

  it("registers an existing folder outside workSpaceRoot without moving it", () => {
    const { projects, root } = createHarness();
    const external = path.join(root, "external-volume", "Novel");
    mkdirSync(external, { recursive: true });
    writeFileSync(path.join(external, "chapter.md"), "chapter", "utf8");

    const project = projects.openProject(external);

    expect(project.locationType).toBe("linked");
    expect(project.path).toBe(path.resolve(external));
    expect(existsSync(path.join(external, "chapter.md"))).toBe(true);
    expect(existsSync(path.join(external, ".storyos", "project.json"))).toBe(true);
  });

  it("blocks file tools from sibling projects and internal state", () => {
    const { root } = createHarness();
    const projectRoot = path.join(root, "ProjectA");
    mkdirSync(path.join(projectRoot, ".storyos"), { recursive: true });
    const context = new WorkspaceToolContext(projectRoot);

    expect(context.paths.resolve("chapter.md")).toBe(path.join(projectRoot, "chapter.md"));
    expect(() => context.paths.resolve(path.join(root, "ProjectB", "secret.md"))).toThrow("outside the active project workspace");
    expect(() => context.paths.resolve(".storyos/project.json")).toThrow("internal state directory");
  });

  it("keeps workspace roots and read-before-write state isolated per context", async () => {
    const { root } = createHarness();
    const projectA = path.join(root, "ProjectA");
    const projectB = path.join(root, "ProjectB");
    mkdirSync(projectA);
    mkdirSync(projectB);
    const fileA = path.join(projectA, "chapter.md");
    writeFileSync(fileA, "chapter", "utf8");
    const contextA = new WorkspaceToolContext(projectA);
    const contextB = new WorkspaceToolContext(projectB);
    const sameRootContext = new WorkspaceToolContext(projectA);

    expect(contextA.paths.resolve("chapter.md")).toBe(fileA);
    expect(contextB.paths.resolve("chapter.md")).toBe(path.join(projectB, "chapter.md"));

    contextA.files.remember(
      fileA,
      "chapter",
      statSync(fileA).mtimeMs,
      false,
    );
    await expect(
      contextA.files.assertFreshForWrite(fileA, "chapter"),
    ).resolves.toBeUndefined();
    await expect(
      sameRootContext.files.assertFreshForWrite(fileA, "chapter"),
    ).rejects.toThrow("File has not been read yet");
  });

  it("migrates legacy conversations into their owning project or the system workspace", () => {
    const { projects, agentHome, root } = createHarness();
    const parent = path.join(root, "projects");
    mkdirSync(parent);
    const project = projects.createProject({ name: "myTest", parentPath: parent });
    const legacySessions = path.join(agentHome, "sessions");
    mkdirSync(legacySessions, { recursive: true });
    const projectThread = { id: "project-thread", title: "项目对话", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), metadata: { projectPath: project.path } };
    const unownedThread = { id: "unowned-thread", title: "临时对话", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), metadata: {} };
    writeFileSync(path.join(legacySessions, "index.json"), JSON.stringify({ threads: [projectThread, unownedThread] }), "utf8");
    for (const thread of [projectThread, unownedThread]) {
      writeFileSync(path.join(legacySessions, `${thread.id}.json`), JSON.stringify({ threadId: thread.id, messages: [] }), "utf8");
    }

    new LegacyWorkspaceMigrator(projects, agentHome).migrate();

    const projectIndex = JSON.parse(readFileSync(path.join(project.path, ".storyos", "conversations", "index.json"), "utf8")) as { threads: Array<{ id: string }> };
    const systemIndex = JSON.parse(readFileSync(path.join(projects.getSnapshot().systemWorkspace.path, ".storyos", "conversations", "index.json"), "utf8")) as { threads: Array<{ id: string }> };
    expect(projectIndex.threads.map((thread) => thread.id)).toEqual(["project-thread"]);
    expect(systemIndex.threads.map((thread) => thread.id)).toEqual(["unowned-thread"]);
    expect(existsSync(path.join(agentHome, "migrations", "workspace-v2.json"))).toBe(true);
  });
});
