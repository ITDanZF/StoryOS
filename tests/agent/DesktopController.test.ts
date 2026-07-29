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
  const book = {
    id: "novel-story",
    title: "Story",
    synopsis: "",
    status: "planning" as const,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const volume = {
    id: "volume-1",
    novelId: book.id,
    title: "第一卷",
    summary: "",
    sortOrder: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const chapter = {
    id: "chapter-1",
    novelId: book.id,
    volumeId: volume.id as string | null,
    title: "第一章",
    status: "draft" as const,
    sortOrder: 0,
    currentRevisionId: null as string | null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const novels = {
    getProjectBook: vi.fn(() => book),
    createNovel: vi.fn(),
    updateNovel: vi.fn(),
    listVolumes: vi.fn(() => []),
    listChapters: vi.fn(() => []),
    getCurrentRevision: vi.fn(() => null),
    createVolume: vi.fn(),
    createChapter: vi.fn(),
    deleteVolume: vi.fn(),
    deleteChapter: vi.fn(),
    getChapter: vi.fn(() => chapter),
    saveRevision: vi.fn((input) => ({
      id: "revision-rich-text",
      chapterId: input.chapterId,
      revisionNumber: 1,
      content: input.content,
      contentHash: "hash",
      characterCount: input.characterCount,
      changeSummary: input.changeSummary,
      createdAt: new Date(0).toISOString(),
    })),
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
    closeForProjectMutation: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
    resolve: vi.fn(async (scope) => ({
      conversationScope: scope,
      threads,
      agent,
      novels,
    })),
  };
  const dependencies = { projects, runtime } as unknown as DesktopControllerDependencies;
  vi.mocked(shell.openPath).mockClear();
  vi.mocked(shell.trashItem).mockClear();
  return { agent, book, completion, controller: new DesktopController(dependencies), messages, novels, projects, runtime, threads, volume };
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

  it("resolves an explicit scope before creating a conversation", async () => {
    const harness = createHarness();
    const scope = { kind: "global" } as const;

    await harness.controller.createConversation({
      scope,
      title: "Global ideas",
    });

    expect(harness.runtime.resolve).toHaveBeenCalledWith(scope);
    expect(harness.threads.createThread).toHaveBeenCalledWith({
      title: "Global ideas",
    });
  });

  it("returns the project tree navigation snapshot", async () => {
    const harness = createHarness();

    await expect(harness.controller.getProjectNavigation("prj-story"))
      .resolves.toMatchObject({
        project: { id: "prj-story" },
        book: {
          id: "novel-story",
          volumeCount: 0,
          chapterCount: 0,
        },
        conversations: { activeThreadId: "thread-1" },
      });
    expect(harness.runtime.resolve).toHaveBeenCalledWith({
      kind: "project",
      projectId: "prj-story",
    });
  });

  it("returns explicit uninitialized book state without using project name", async () => {
    const harness = createHarness();
    harness.novels.getProjectBook.mockReturnValue(null);

    await expect(harness.controller.getProjectNavigation("prj-story"))
      .resolves.toMatchObject({ book: null });
    await expect(harness.controller.getBookWorkspace("prj-story"))
      .resolves.toEqual({
        state: "uninitialized",
        projectId: "prj-story",
      });
  });

  it("creates a project book only from user-provided profile data", async () => {
    const harness = createHarness();
    harness.novels.getProjectBook
      .mockReturnValueOnce(null)
      .mockReturnValue(harness.book);

    await harness.controller.createBook({
      projectId: "prj-story",
      title: "Long Night",
      synopsis: "A city mystery.",
      status: "planning",
    });

    expect(harness.novels.createNovel).toHaveBeenCalledWith({
      title: "Long Night",
      synopsis: "A city mystery.",
      status: "planning",
    });
  });

  it("returns persisted chapter content in the book workspace", async () => {
    const harness = createHarness();
    harness.novels.listChapters.mockReturnValue([{
      id: "chapter-1",
      novelId: "novel-story",
      volumeId: null,
      title: "雨夜",
      status: "draft",
      sortOrder: 0,
      currentRevisionId: "revision-1",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }]);
    harness.novels.getCurrentRevision.mockReturnValue({
      id: "revision-1",
      chapterId: "chapter-1",
      revisionNumber: 1,
      content: "雨落在旧城。",
      contentHash: "hash",
      characterCount: 6,
      changeSummary: "初稿",
      createdAt: new Date(0).toISOString(),
    });

    await expect(harness.controller.getBookWorkspace("prj-story"))
      .resolves.toMatchObject({
        book: { id: "novel-story" },
        chapters: [{
          id: "chapter-1",
          content: "雨落在旧城。",
          revisionNumber: 1,
        }],
      });
  });

  it("creates volumes and chapters inside the requested project book", async () => {
    const harness = createHarness();

    await harness.controller.createBookVolume({
      projectId: "prj-story",
      title: "第一卷",
    });
    harness.novels.listVolumes.mockReturnValue([harness.volume]);
    await harness.controller.createBookChapter({
      projectId: "prj-story",
      volumeId: "volume-1",
      title: "第一章",
    });

    expect(harness.novels.createVolume).toHaveBeenCalledWith({
      novelId: "novel-story",
      title: "第一卷",
      sortOrder: 0,
    });
    expect(harness.novels.createChapter).toHaveBeenCalledWith({
      novelId: "novel-story",
      volumeId: "volume-1",
      title: "第一章",
      status: "outline",
      sortOrder: 0,
    });
  });

  it("appends new book items after the highest existing sort order", async () => {
    const harness = createHarness();
    harness.novels.listVolumes.mockReturnValue([{
      id: "volume-1",
      novelId: "novel-story",
      title: "Existing volume",
      summary: "",
      sortOrder: 4,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }]);
    harness.novels.listChapters.mockReturnValue([{
      ...harness.novels.getChapter(),
      sortOrder: 7,
    }]);

    await harness.controller.createBookVolume({
      projectId: "prj-story",
      title: "Next volume",
    });
    await harness.controller.createBookChapter({
      projectId: "prj-story",
      volumeId: "volume-1",
      title: "Next chapter",
    });

    expect(harness.novels.createVolume).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 5 }),
    );
    expect(harness.novels.createChapter).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 8 }),
    );
  });

  it("rejects chapters that are not assigned to an existing volume", async () => {
    const harness = createHarness();

    await expect(harness.controller.createBookChapter({
      projectId: "prj-story",
      volumeId: "missing-volume",
      title: "第一章",
    })).rejects.toThrow("must belong to an existing book volume");

    expect(harness.novels.createChapter).not.toHaveBeenCalled();
  });

  it("updates the project book title without changing book metadata", async () => {
    const harness = createHarness();

    await harness.controller.updateBook({
      projectId: "prj-story",
      title: "A new title",
      synopsis: "Updated synopsis",
      status: "writing",
    });

    expect(harness.novels.updateNovel).toHaveBeenCalledWith({
      id: "novel-story",
      title: "A new title",
      synopsis: "Updated synopsis",
      status: "writing",
    });
  });

  it("deletes volumes and chapters inside the requested project", async () => {
    const harness = createHarness();

    await harness.controller.deleteBookVolume({
      projectId: "prj-story",
      volumeId: "volume-1",
    });
    await harness.controller.deleteBookChapter({
      projectId: "prj-story",
      chapterId: "chapter-1",
    });

    expect(harness.runtime.resolve).toHaveBeenCalledWith({
      kind: "project",
      projectId: "prj-story",
    });
    expect(harness.novels.deleteVolume).toHaveBeenCalledWith("volume-1");
    expect(harness.novels.deleteChapter).toHaveBeenCalledWith("chapter-1");
  });

  it("validates and saves Tiptap JSON with visible character count", async () => {
    const harness = createHarness();
    const content = JSON.stringify({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "雨 夜", marks: [{ type: "bold" }] },
        ],
      }],
    });

    await harness.controller.saveBookChapterContent({
      projectId: "prj-story",
      chapterId: "chapter-1",
      content,
    });

    expect(harness.novels.saveRevision).toHaveBeenCalledWith({
      chapterId: "chapter-1",
      content,
      characterCount: 2,
      changeSummary: "自动保存",
      expectedCurrentRevisionId: null,
    });
    await expect(harness.controller.saveBookChapterContent({
      projectId: "prj-story",
      chapterId: "chapter-1",
      content: "not-json",
    })).rejects.toThrow("valid Tiptap JSON");
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
  it("delegates shutdown to the workspace runtime", async () => {
    const harness = createHarness();

    await harness.controller.shutdown();

    expect(harness.runtime.shutdown).toHaveBeenCalledOnce();
  });

});
