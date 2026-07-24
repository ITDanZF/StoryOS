import type {
  AgentDesktopApi,
  ApplicationEvent,
  MessageDto,
  ProjectDto,
  ProjectSnapshot,
  ThreadDto,
  ThreadSnapshot,
} from "../../../../shared/agent/contracts.ts";

const previewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

if (previewEnabled && !window.storyOSAgent) {
  const handlers = new Set<(event: ApplicationEvent) => void>();
  const now = new Date().toISOString();
  let activeProjectId: string | null = null;
  let projects: ProjectDto[] = [];
  const threadsByScope = new Map<string, ThreadDto[]>();
  const activeThreads = new Map<string, string>();
  const messages = new Map<string, MessageDto[]>();
  const scopeId = () => activeProjectId ?? "system-default";

  const ensureThread = (): ThreadDto => {
    const scope = scopeId();
    const existing = threadsByScope.get(scope) ?? [];
    const active = existing.find((thread) => thread.id === activeThreads.get(scope)) ?? existing[0];
    if (active) return active;
    const thread: ThreadDto = { id: crypto.randomUUID(), title: "新对话", createdAt: now, updatedAt: now, metadata: {} };
    threadsByScope.set(scope, [thread]);
    activeThreads.set(scope, thread.id);
    messages.set(thread.id, []);
    return thread;
  };

  const threadSnapshot = (): ThreadSnapshot => {
    const activeThread = ensureThread();
    return { activeThreadId: activeThread.id, activeThread, threads: threadsByScope.get(scopeId()) ?? [activeThread] };
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
  const emit = (event: ApplicationEvent) => handlers.forEach((handler) => handler(event));

  ensureThread();
  const api: AgentDesktopApi = {
    getStatus: async () => ({ configured: true, initialized: true, provider: "deepseek", modelName: "deepseek-chat", baseUrl: "https://api.deepseek.com" }),
    configure: async () => ({ configured: true, initialized: true }),
    getThreadSnapshot: async () => threadSnapshot(),
    listMessages: async (threadId = ensureThread().id) => messages.get(threadId) ?? [],
    createThread: async (title) => {
      const thread: ThreadDto = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: {} };
      threadsByScope.set(scopeId(), [thread, ...(threadsByScope.get(scopeId()) ?? [])]);
      activeThreads.set(scopeId(), thread.id);
      messages.set(thread.id, []);
      return thread;
    },
    switchThread: async (threadId) => {
      activeThreads.set(scopeId(), threadId);
      return threadSnapshot();
    },
    deleteThread: async (threadId) => {
      threadsByScope.set(scopeId(), (threadsByScope.get(scopeId()) ?? []).filter((thread) => thread.id !== threadId));
      activeThreads.delete(scopeId());
      return threadSnapshot();
    },
    getProjectSnapshot: async () => projectSnapshot(),
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
      ensureThread();
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
      ensureThread();
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
      ensureThread();
      return workspaceSnapshot();
    },
    removeProject: async (projectPath) => {
      const removed = projects.find((project) => project.path === projectPath);
      projects = projects.filter((project) => project.path !== projectPath);
      if (removed?.id === activeProjectId) activeProjectId = null;
      ensureThread();
      return workspaceSnapshot();
    },
    listRuns: async () => [],
    sendMessage: async ({ threadId, content }) => {
      const runId = `preview-${crypto.randomUUID()}`;
      messages.set(threadId, [...(messages.get(threadId) ?? []), { id: crypto.randomUUID(), threadId, role: "user", content, createdAt: new Date().toISOString() }]);
      queueMicrotask(() => emit({ type: "run_started", runId, threadId, timestamp: new Date().toISOString() }));
      window.setTimeout(() => emit({ type: "text_delta", runId, content: "这是一个基础的流式回复预览。", timestamp: new Date().toISOString() }), 250);
      window.setTimeout(() => emit({ type: "run_completed", runId, content: "这是一个基础的流式回复预览。", durationMs: 650, timestamp: new Date().toISOString() }), 650);
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
    onEvent: (handler) => { handlers.add(handler); return () => handlers.delete(handler); },
  };
  Object.defineProperty(window, "storyOSAgent", { configurable: true, value: api });
}