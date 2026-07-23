import { shell } from "electron";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: { openPath: vi.fn(async () => ""), trashItem: vi.fn(async () => undefined) },
}));

import type { MessageRole, ThreadSkillState } from "../../src/main/agent/application/threadPorts.ts";
import DesktopController from "../../src/main/agent/electron/DesktopController.ts";
import type { DesktopControllerDependencies } from "../../src/main/agent/electron/DesktopController.ts";

type StoredMessage = { readonly role: MessageRole; readonly content: string; readonly threadId: string };
type TestMessage = StoredMessage & { readonly id: string; readonly createdAt: string };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function createHarness() {
  const completion = createDeferred<string>();
  const messages: StoredMessage[] = [];
  const skillState: ThreadSkillState = { activeSkillIds: [], disabledSkillIds: [] };
  const activeThread = { id: "thread-1", title: "Desktop", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), metadata: {} };
  const threadSnapshot = { activeThreadId: "thread-1", activeThread, threads: [activeThread] };
  const project = {
    id: "prj-story",
    path: "C:\\projects\\Story",
    name: "Story",
    locationType: "created" as const,
    trusted: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    lastOpenedAt: new Date(0).toISOString(),
  };
  const systemWorkspace = { id: "system-default" as const, name: "无项目对话" as const, path: "C:\\projects\\.storyos-default" };
  let activeProject: typeof project | null = project;
  const snapshot = () => ({
    activeProjectId: activeProject?.id ?? null,
    activeProjectPath: activeProject?.path ?? null,
    activeProject,
    projects: activeProject ? [activeProject] : [],
    creationDefaults: { parentPath: "C:\\projects" },
    systemWorkspace,
  });
  const agent = {
    startRun: vi.fn(() => "run-1"),
    waitForRun: vi.fn((): Promise<string> => completion.promise),
    cancelRun: vi.fn(() => true),
    listRuns: vi.fn(() => []),
    resolveApproval: vi.fn(async () => true),
    hasActiveRuns: vi.fn(() => false),
  };
  const threads = {
    appendMessage: vi.fn((input: StoredMessage): TestMessage => {
      messages.push(input);
      return { id: `message-${messages.length}`, createdAt: new Date(0).toISOString(), ...input };
    }),
    getSnapshot: vi.fn(() => threadSnapshot),
    listMessages: vi.fn(() => []),
    createThread: vi.fn(),
    switchThread: vi.fn(() => threadSnapshot),
    deleteThread: vi.fn(() => threadSnapshot),
    useSkill: vi.fn(() => skillState),
    disableSkill: vi.fn(() => skillState),
    clearSkillState: vi.fn(() => skillState),
  };
  const projects = {
    getSnapshot: vi.fn(() => snapshot()),
    getProject: vi.fn(() => project),
    renameProject: vi.fn(() => ({ previousProject: project, project: { ...project, path: "C:\\projects\\Renamed", name: "Renamed" } })),
    rollbackProjectRename: vi.fn(),
    removeProject: vi.fn(() => { activeProject = null; return snapshot(); }),
    switchProject: vi.fn(() => snapshot()),
  };
  const runtime = {
    agent,
    threads,
    skills: { getSnapshot: vi.fn(() => ({ skills: [], issues: [], loadedAt: new Date(0).toISOString() })), getSkill: vi.fn(() => null) },
    subscribe: vi.fn((): (() => void) => () => undefined),
    activate: vi.fn(async () => undefined),
    closeForProjectMutation: vi.fn(),
  };
  const dependencies = { projects, runtime } as unknown as DesktopControllerDependencies;
  vi.mocked(shell.openPath).mockClear();
  vi.mocked(shell.trashItem).mockClear();
  return { agent, completion, controller: new DesktopController(dependencies), messages, projects, runtime, threads };
}

describe("DesktopController", () => {
  it("persists the user message before the run and the answer after completion", async () => {
    const harness = createHarness();
    expect(harness.controller.sendMessage({ threadId: "thread-1", content: "hello" })).toEqual({ runId: "run-1" });
    expect(harness.messages).toEqual([{ threadId: "thread-1", role: "user", content: "hello" }]);
    harness.completion.resolve("world");
    await harness.completion.promise;
    await Promise.resolve();
    expect(harness.messages.at(-1)).toEqual({ threadId: "thread-1", role: "assistant", content: "world" });
  });

  it("does not persist an assistant message when the run fails", async () => {
    const harness = createHarness();
    harness.controller.sendMessage({ threadId: "thread-1", content: "hello" });
    harness.completion.reject(new Error("model failed"));
    await expect(harness.completion.promise).rejects.toThrow("model failed");
    await Promise.resolve();
    expect(harness.messages).toHaveLength(1);
  });

  it("rejects empty messages before writing history", () => {
    const harness = createHarness();
    expect(() => harness.controller.sendMessage({ threadId: "thread-1", content: "  " })).toThrow("Message content is required.");
    expect(harness.messages).toEqual([]);
  });

  it("opens a registered project directory through the operating system", async () => {
    const harness = createHarness();
    await harness.controller.openProjectDirectory("C:\\projects\\Story");
    expect(shell.openPath).toHaveBeenCalledWith("C:\\projects\\Story");
  });

  it("closes the active runtime before moving a project to the recycle bin", async () => {
    const harness = createHarness();
    await harness.controller.deleteProject("C:\\projects\\Story");
    expect(harness.runtime.closeForProjectMutation).toHaveBeenCalledWith("C:\\projects\\Story");
    expect(shell.trashItem).toHaveBeenCalledWith("C:\\projects\\Story");
    expect(harness.projects.removeProject).toHaveBeenCalledWith("C:\\projects\\Story");
  });

  it("releases and reactivates the project runtime around a disk rename", async () => {
    const harness = createHarness();
    await harness.controller.renameProject({ projectPath: "C:\\projects\\Story", name: "Renamed" });
    expect(harness.runtime.closeForProjectMutation).toHaveBeenCalledWith("C:\\projects\\Story");
    expect(harness.runtime.activate).toHaveBeenCalledWith("C:\\projects\\Renamed");
  });
});