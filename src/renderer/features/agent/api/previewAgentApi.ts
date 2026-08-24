import type {
  AgentDesktopApi,
  ApplicationEvent,
  BookWorkspaceChapterDto,
  BookWorkspaceSnapshot,
  ReadyBookWorkspaceSnapshot,
  ConversationApplicationEvent,
  ConversationEvent,
  ConversationScope,
  MessageDto,
  ProjectDto,
  ProjectSnapshot,
  ThreadDto,
  ThreadSnapshot,
} from "../../../../shared/agent/contracts.ts";
import {
  countTiptapCharacters,
  parseTiptapDocument,
} from "../../../../shared/book/richText.ts";

type PreviewConversationEventInput = ConversationEvent extends infer TEvent
  ? TEvent extends ConversationEvent
    ? Omit<TEvent, "eventId" | "sequence" | "runId" | "threadId" | "timestamp">
    : never
  : never;

const previewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

if (previewEnabled && !window.storyOSAgent) {
  const handlers =
    new Set<(event: ConversationApplicationEvent) => void>();
  const now = new Date().toISOString();
  let activeProjectId: string | null = null;
  let projects: ProjectDto[] = [];
  const bookWorkspaces = new Map<string, BookWorkspaceSnapshot>();
  const threadsByScope = new Map<string, ThreadDto[]>();
  const activeThreads = new Map<string, string>();
  const messages = new Map<string, MessageDto[]>();
  const conversationEvents = new Map<string, ConversationEvent[]>();
  const scopeId = () => activeProjectId ?? "system-default";
  const keyForScope = (scope: ConversationScope) =>
    scope.kind === "global" ? "system-default" : scope.projectId;

  const threadSnapshot = (): ThreadSnapshot => threadSnapshotFor(activeScope());
  const threadSnapshotFor = (scope: ConversationScope): ThreadSnapshot => {
    const key = keyForScope(scope);
    const existing = threadsByScope.get(key) ?? [];
    const activeThread =
      existing.find((thread) => thread.id === activeThreads.get(key)) ??
      existing[0] ??
      null;
    return {
      activeThreadId: activeThread?.id ?? null,
      activeThread,
      threads: existing,
    };
  };

  const projectSnapshot = (): ProjectSnapshot => {
    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    return {
      activeProjectId: activeProject?.id ?? null,
      activeProjectPath: activeProject?.path ?? null,
      activeProject,
      projects,
      creationDefaults: { parentPath: "/preview/workSpaceRoot" },
      systemWorkspace: { id: "system-default", name: "无项目对话", path: "/preview/workSpaceRoot/.storyos-default" },
    };
  };
  const workspaceSnapshot = () => ({ projects: projectSnapshot(), threads: threadSnapshot() });
  const bookWorkspace = (projectId: string): BookWorkspaceSnapshot => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const stored = bookWorkspaces.get(projectId);
    if (stored) return stored;
    const snapshot: BookWorkspaceSnapshot = {
      state: "uninitialized",
      projectId,
    };
    bookWorkspaces.set(projectId, snapshot);
    return snapshot;
  };
  const readyBookWorkspace = (
    projectId: string,
  ): ReadyBookWorkspaceSnapshot => {
    const snapshot = bookWorkspace(projectId);
    if (snapshot.state !== "ready") {
      throw new Error("Project book has not been created.");
    }
    return snapshot;
  };
  const activeScope = (): ConversationScope => activeProjectId
    ? { kind: "project", projectId: activeProjectId }
    : { kind: "global" };
  const emit = (
    event: ApplicationEvent,
    conversationScope: ConversationScope = activeScope(),
  ) => handlers.forEach((handler) => handler({
    ...event,
    conversationScope,
  }));
  const sendPreviewMessage = async (
    request: { readonly threadId: string; readonly content: string },
    scope: ConversationScope,
  ) => {
    const { threadId, content } = request;
    const runId = `preview-${crypto.randomUUID()}`;
    const messageId = crypto.randomUUID();
    messages.set(threadId, [...(messages.get(threadId) ?? []), { id: messageId, threadId, role: "user", content, createdAt: new Date().toISOString() }]);
    let sequence = 0;
    const publish = (event: PreviewConversationEventInput) => {
      const structured = {
        ...event,
        eventId: `preview-event-${crypto.randomUUID()}`,
        sequence: ++sequence,
        runId,
        threadId,
        timestamp: new Date().toISOString(),
      } as ConversationEvent;
      conversationEvents.set(threadId, [...(conversationEvents.get(threadId) ?? []), structured]);
      emit(structured, scope);
    };
    queueMicrotask(() => emit({ type: "run_started", runId, threadId, timestamp: new Date().toISOString() }, scope));
    queueMicrotask(() => {
      publish({ type: "user.message.created", payload: { messageId, content } });
      publish({ type: "turn.started", payload: {} });
      publish({ type: "assistant.block.started", stepId: "step-1", blockId: "reasoning-1", payload: { channel: "reasoning" } });
    });
    window.setTimeout(() => publish({ type: "assistant.block.delta", stepId: "step-1", blockId: "reasoning-1", payload: { channel: "reasoning", delta: "正在理解你的目标并检查当前上下文…" } }), 120);
    window.setTimeout(() => {
      publish({ type: "assistant.block.completed", stepId: "step-1", blockId: "reasoning-1", payload: { channel: "reasoning" } });
      publish({ type: "assistant.block.started", stepId: "step-1", blockId: "answer-1", payload: { channel: "answer" } });
      publish({ type: "assistant.block.delta", stepId: "step-1", blockId: "answer-1", payload: { channel: "answer", delta: "这是一个基础的流式回复预览。" } });
    }, 250);
    window.setTimeout(() => {
      publish({ type: "assistant.block.completed", stepId: "step-1", blockId: "answer-1", payload: { channel: "answer" } });
      publish({ type: "turn.completed", payload: { content: "这是一个基础的流式回复预览。", durationMs: 650 } });
      emit({ type: "run_completed", runId, content: "这是一个基础的流式回复预览。", durationMs: 650, timestamp: new Date().toISOString() }, scope);
    }, 650);
    return { runId };
  };

  const api: AgentDesktopApi = {
    getStatus: async () => ({ configured: true, initialized: true, provider: "deepseek", modelName: "deepseek-chat", baseUrl: "https://api.deepseek.com" }),
    configure: async () => ({ configured: true, initialized: true }),
    getThreadSnapshot: async () => threadSnapshot(),
    getConversationSnapshot: async (scope) => ({
      scope,
      threads: threadSnapshotFor(scope),
    }),
    listMessages: async (threadId) => threadId ? messages.get(threadId) ?? [] : [],
    listConversationMessages: async ({ threadId }) => messages.get(threadId) ?? [],
    listConversationEvents: async ({ threadId }) => conversationEvents.get(threadId) ?? [],
    createThread: async (title) => {
      const thread: ThreadDto = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: {} };
      threadsByScope.set(scopeId(), [thread, ...(threadsByScope.get(scopeId()) ?? [])]);
      activeThreads.set(scopeId(), thread.id);
      messages.set(thread.id, []);
      return thread;
    },
    createConversation: async ({ scope, title }) => {
      const key = keyForScope(scope);
      const thread: ThreadDto = {
        id: crypto.randomUUID(),
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };
      threadsByScope.set(key, [thread, ...(threadsByScope.get(key) ?? [])]);
      activeThreads.set(key, thread.id);
      messages.set(thread.id, []);
      return thread;
    },
    switchThread: async (threadId) => {
      activeThreads.set(scopeId(), threadId);
      return threadSnapshot();
    },
    switchConversation: async ({ scope, threadId }) => {
      activeThreads.set(keyForScope(scope), threadId);
      return { scope, threads: threadSnapshotFor(scope) };
    },
    deleteThread: async (threadId) => {
      threadsByScope.set(scopeId(), (threadsByScope.get(scopeId()) ?? []).filter((thread) => thread.id !== threadId));
      activeThreads.delete(scopeId());
      return threadSnapshot();
    },
    deleteConversation: async ({ scope, threadId }) => {
      const key = keyForScope(scope);
      threadsByScope.set(
        key,
        (threadsByScope.get(key) ?? []).filter(
          (thread) => thread.id !== threadId,
        ),
      );
      if (activeThreads.get(key) === threadId) activeThreads.delete(key);
      return { scope, threads: threadSnapshotFor(scope) };
    },
    getProjectSnapshot: async () => projectSnapshot(),
    getProjectNavigation: async (projectId) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const workspace = bookWorkspace(projectId);
      return {
        project,
        book: workspace.state === "ready" ? {
          id: workspace.book.id,
          title: workspace.book.title,
          status: workspace.book.status,
          volumeCount: workspace.volumes.length,
          chapterCount: workspace.chapters.length,
          updatedAt: workspace.book.updatedAt,
        } : null,
        conversations: threadSnapshotFor({
          kind: "project",
          projectId,
        }),
      };
    },
    getBookWorkspace: async (projectId) => bookWorkspace(projectId),
    createBook: async ({ projectId, title, synopsis, status }) => {
      const current = bookWorkspace(projectId);
      if (current.state === "ready") {
        throw new Error("This project already contains a book.");
      }
      const createdAt = new Date().toISOString();
      const next: ReadyBookWorkspaceSnapshot = {
        state: "ready",
        book: {
          id: `novel_${crypto.randomUUID()}`,
          title,
          synopsis,
          status,
          createdAt,
          updatedAt: createdAt,
        },
        volumes: [],
        chapters: [],
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    createBookChapter: async ({ projectId, volumeId, title }) => {
      const current = readyBookWorkspace(projectId);
      if (!current.volumes.some((volume) => volume.id === volumeId)) {
        throw new Error("章节必须属于已有分卷。");
      }
      const createdAt = new Date().toISOString();
      const chapter: BookWorkspaceChapterDto = {
        id: `chapter_${crypto.randomUUID()}`,
        novelId: current.book.id,
        volumeId,
        title,
        status: "outline" as const,
        sortOrder: current.chapters
          .filter((item) => item.volumeId === volumeId)
          .reduce(
            (maximum, item) => Math.max(maximum, item.sortOrder),
            -1,
          ) + 1,
        currentRevisionId: null,
        content: "",
        characterCount: 0,
        revisionNumber: null,
        createdAt,
        updatedAt: createdAt,
      };
      const next = {
        ...current,
        chapters: [...current.chapters, chapter],
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    createBookVolume: async ({ projectId, title }) => {
      const current = readyBookWorkspace(projectId);
      const createdAt = new Date().toISOString();
      const next = {
        ...current,
        volumes: [
          ...current.volumes,
          {
            id: `volume_${crypto.randomUUID()}`,
            novelId: current.book.id,
            title,
            summary: "",
            sortOrder: current.volumes.reduce(
              (maximum, volume) => Math.max(maximum, volume.sortOrder),
              -1,
            ) + 1,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    deleteBookVolume: async ({ projectId, volumeId }) => {
      const current = readyBookWorkspace(projectId);
      const next = {
        ...current,
        volumes: current.volumes.filter((volume) => volume.id !== volumeId),
        chapters: current.chapters.map((chapter) =>
          chapter.volumeId === volumeId
            ? { ...chapter, volumeId: null }
            : chapter),
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    deleteBookChapter: async ({ projectId, chapterId }) => {
      const current = readyBookWorkspace(projectId);
      const next = {
        ...current,
        chapters: current.chapters.filter(
          (chapter) => chapter.id !== chapterId,
        ),
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    updateBook: async ({ projectId, title, synopsis, status }) => {
      const current = readyBookWorkspace(projectId);
      const next = {
        ...current,
        book: {
          ...current.book,
          title,
          synopsis,
          status,
          updatedAt: new Date().toISOString(),
        },
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    updateBookChapter: async ({ projectId, chapterId, title }) => {
      const current = readyBookWorkspace(projectId);
      const next = {
        ...current,
        chapters: current.chapters.map((chapter) =>
          chapter.id === chapterId
            ? { ...chapter, title, updatedAt: new Date().toISOString() }
            : chapter),
      };
      bookWorkspaces.set(projectId, next);
      return next;
    },
    saveBookChapterContent: async ({ projectId, chapterId, content }) => {
      const current = readyBookWorkspace(projectId);
      const source = current.chapters.find(
        (chapter) => chapter.id === chapterId,
      );
      if (!source) throw new Error(`Chapter not found: ${chapterId}`);
      const document = parseTiptapDocument(content);
      const createdAt = new Date().toISOString();
      const revisionNumber = (source.revisionNumber ?? 0) + 1;
      const revision = {
        id: `revision_${crypto.randomUUID()}`,
        chapterId,
        revisionNumber,
        content,
        contentHash: "preview",
        characterCount: countTiptapCharacters(document),
        changeSummary: "自动保存",
        createdAt,
      };
      const chapter = {
        ...source,
        currentRevisionId: revision.id,
        content,
        characterCount: revision.characterCount,
        revisionNumber,
        updatedAt: createdAt,
      };
      bookWorkspaces.set(projectId, {
        ...current,
        chapters: current.chapters.map((item) =>
          item.id === chapterId ? chapter : item),
      });
      return { chapter, revision };
    },
    getWorkspaceSnapshot: async () => workspaceSnapshot(),
    createProject: async ({ name, parentPath }) => {
      const createdAt = new Date().toISOString();
      const project: ProjectDto = {
        id: `prj_${crypto.randomUUID()}`,
        path: `${parentPath ?? "/preview/workSpaceRoot"}/${name.trim().replace(/\s+/g, "-")}`,
        name,
        locationType: "created",
        trusted: true,
        createdAt,
        updatedAt: createdAt,
        lastOpenedAt: createdAt,
      };
      projects = [project, ...projects];
      activeProjectId = project.id;
      return workspaceSnapshot();
    },
    openProject: async (projectPath) => {
      const createdAt = new Date().toISOString();
      const project: ProjectDto = {
        id: `prj_${crypto.randomUUID()}`,
        path: projectPath,
        name: projectPath.split(/[\\/]+/).filter(Boolean).pop() ?? projectPath,
        locationType: "linked",
        trusted: true,
        createdAt,
        updatedAt: createdAt,
        lastOpenedAt: createdAt,
      };
      projects = [project, ...projects.filter((item) => item.path !== projectPath)];
      activeProjectId = project.id;
      return workspaceSnapshot();
    },
    openProjectDirectory: async () => undefined,
    renameProject: async ({ projectPath, name }) => {
      const project = projects.find((item) => item.path === projectPath);
      if (!project) throw new Error(`Project not found: ${projectPath}`);
      const separatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
      const nextPath = `${projectPath.slice(0, separatorIndex)}/${name.trim().replace(/[\\/:*?"<>|\s]+/g, "-")}`;
      const updated = { ...project, name, path: nextPath, updatedAt: new Date().toISOString() };
      projects = projects.map((item) => item.id === project.id ? updated : item);
      return workspaceSnapshot();
    },
    deleteProject: async (projectPath) => api.removeProject(projectPath),
    switchProject: async (projectPath) => {
      activeProjectId = projects.find((project) => project.path === projectPath)?.id ?? null;
      return workspaceSnapshot();
    },
    removeProject: async (projectPath) => {
      const removed = projects.find((project) => project.path === projectPath);
      projects = projects.filter((project) => project.path !== projectPath);
      if (removed?.id === activeProjectId) activeProjectId = null;
      if (removed) bookWorkspaces.delete(removed.id);
      return workspaceSnapshot();
    },
    listRuns: async () => [],
    sendMessage: async (request) => sendPreviewMessage(request, activeScope()),
    sendConversationMessage: async ({ scope, threadId, content }) =>
      sendPreviewMessage({ threadId, content }, scope),
    cancelRun: async (runId) => {
      emit({ type: "run_aborted", runId, error: { name: "Cancelled", message: "回复已停止", code: "run.cancelled", phase: "execution", retryable: false }, durationMs: 0, timestamp: new Date().toISOString() });
      return true;
    },
    cancelConversationRun: async (_scope, runId) => api.cancelRun(runId),
    listConversationRuns: async () => [],
    resolveApproval: async () => false,
    resolveConversationApproval: async () => false,
    getSkillSnapshot: async () => ({ loadedAt: now, issues: [], skills: [] }),
    getSkill: async () => null,
    useSkill: async () => ({ activeSkillIds: [], disabledSkillIds: [] }),
    disableSkill: async () => ({ activeSkillIds: [], disabledSkillIds: [] }),
    clearSkillState: async () => ({ activeSkillIds: [], disabledSkillIds: [] }),
    onEvent: (handler) => { handlers.add(handler); return () => handlers.delete(handler); },
    onEditorToolRequest: () => () => undefined,
  };
  Object.defineProperty(window, "storyOSAgent", { configurable: true, value: api });
}
