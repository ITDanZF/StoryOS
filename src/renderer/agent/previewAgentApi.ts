import type {
  AgentDesktopApi,
  ApplicationEvent,
  MessageDto,
  ProjectDto,
  ProjectSnapshot,
  ThreadDto,
  ThreadSnapshot,
} from "../../shared/agent/contracts.ts";

const previewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

if (previewEnabled && !window.storyOSAgent) {
  const handlers = new Set<(event: ApplicationEvent) => void>();
  const now = new Date().toISOString();
  let activeThreadId = "welcome";
  let activeProjectPath: string | null = null;
  let projects: ProjectDto[] = [];
  let threads: ThreadDto[] = [
    { id: "welcome", title: "欢迎使用 StoryOS", createdAt: now, updatedAt: now, metadata: {} },
    { id: "second", title: "新的对话", createdAt: now, updatedAt: now, metadata: {} },
  ];
  const messages = new Map<string, MessageDto[]>([["welcome", [
    { id: "hello", threadId: "welcome", role: "assistant", content: "你好，我是 StoryOS AI。有什么想聊的，直接告诉我就好。", createdAt: now },
  ]]]);

  const snapshot = (projectPath: string | null = activeProjectPath): ThreadSnapshot => {
    const visibleThreads = threads.filter((thread) => {
      const threadProjectPath = thread.metadata.projectPath ?? "";
      return projectPath ? threadProjectPath === projectPath : !threadProjectPath;
    });
    const activeThread = visibleThreads.find((thread) => thread.id === activeThreadId) ?? visibleThreads[0] ?? threads[0];
    return { activeThreadId: activeThread.id, activeThread, threads: visibleThreads.length ? visibleThreads : [activeThread] };
  };
  const projectSnapshot = (): ProjectSnapshot => {
    const activeProject = projects.find((project) => project.path === activeProjectPath) ?? null;
    return { activeProjectPath, activeProject, projects };
  };
  const emit = (event: ApplicationEvent) => handlers.forEach((handler) => handler(event));

  const api: AgentDesktopApi = {
    getStatus: async () => ({
      configured: true,
      initialized: true,
      provider: "deepseek",
      modelName: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    }),
    configure: async () => ({ configured: true, initialized: true }),
    getThreadSnapshot: async (projectPath) => snapshot(projectPath ?? activeProjectPath),
    listMessages: async (threadId = activeThreadId) => messages.get(threadId) ?? [],
    createThread: async (title, projectPath) => {
      const thread: ThreadDto = {
        id: crypto.randomUUID(),
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: projectPath ? { projectPath } : {},
      };
      threads = [thread, ...threads];
      activeThreadId = thread.id;
      messages.set(thread.id, []);
      return thread;
    },
    switchThread: async (threadId) => {
      activeThreadId = threadId;
      return snapshot();
    },
    deleteThread: async (threadId) => {
      threads = threads.filter((thread) => thread.id !== threadId);
      if (threads.length === 0) await api.createThread("新对话");
      activeThreadId = threads[0].id;
      return snapshot();
    },
    getProjectSnapshot: async () => projectSnapshot(),
    createProject: async ({ name }) => {
      const now = new Date().toISOString();
      const project: ProjectDto = {
        path: `/preview/${name.trim().replace(/\s+/g, "-")}`,
        name,
        trusted: true,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      projects = [project, ...projects];
      activeProjectPath = project.path;
      await api.createThread("新对话", project.path);
      return project;
    },
    openProject: async (projectPath) => {
      const now = new Date().toISOString();
      const name = projectPath.split(/[\\/]+/).filter(Boolean).pop() ?? projectPath;
      const project: ProjectDto = { path: projectPath, name, trusted: true, createdAt: now, updatedAt: now, lastOpenedAt: now };
      projects = [project, ...projects.filter((item) => item.path !== projectPath)];
      activeProjectPath = project.path;
      await api.createThread("新对话", project.path);
      return project;
    },
    switchProject: async (projectPath) => {
      activeProjectPath = projectPath;
      const nextSnapshot = snapshot(projectPath);
      activeThreadId = nextSnapshot.activeThreadId;
      return projectSnapshot();
    },
    removeProject: async (projectPath) => {
      projects = projects.filter((project) => project.path !== projectPath);
      if (activeProjectPath === projectPath) activeProjectPath = projects[0]?.path ?? null;
      return projectSnapshot();
    },
    listRuns: async () => [],
    sendMessage: async ({ threadId, content }) => {
      const runId = `preview-${crypto.randomUUID()}`;
      messages.set(threadId, [...(messages.get(threadId) ?? []), {
        id: crypto.randomUUID(), threadId, role: "user", content, createdAt: new Date().toISOString(),
      }]);
      queueMicrotask(() => emit({ type: "run_started", runId, threadId, timestamp: new Date().toISOString() }));
      window.setTimeout(() => emit({ type: "text_delta", runId, content: "这是一个基础的流式回复预览。", timestamp: new Date().toISOString() }), 250);
      window.setTimeout(() => {
        const answer = "这是一个基础的流式回复预览。实际运行时，内容会由你配置的 AI 模型生成。";
        messages.set(threadId, [...(messages.get(threadId) ?? []), {
          id: crypto.randomUUID(), threadId, role: "assistant", content: answer, createdAt: new Date().toISOString(),
        }]);
        emit({ type: "run_completed", runId, content: answer, durationMs: 650, timestamp: new Date().toISOString() });
      }, 650);
      return { runId };
    },
    cancelRun: async (runId) => {
      emit({ type: "run_aborted", runId, error: { name: "Cancelled", message: "回复已停止" }, durationMs: 0, timestamp: new Date().toISOString() });
      return true;
    },
    resolveApproval: async () => false,
    getSkillSnapshot: async () => ({ loadedAt: now, issues: [], skills: [] }),
    getSkill: async () => null,
    useSkill: async () => ({ activeSkillIds: [], disabledSkillIds: [] }),
    disableSkill: async () => ({ activeSkillIds: [], disabledSkillIds: [] }),
    clearSkillState: async () => ({ activeSkillIds: [], disabledSkillIds: [] }),
    onEvent: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };

  Object.defineProperty(window, "storyOSAgent", { configurable: true, value: api });
}
