import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentConfigurationRequest,
  AgentServiceStatus,
  ConversationApplicationEvent,
  ConversationScope,
  CreateProjectRequest,
  MessageDto,
  ProjectSnapshot,
  ProjectNavigationSnapshot,
  RenameProjectRequest,
  RunSnapshot,
  ThreadSnapshot,
  WorkspaceSnapshot,
} from "../../../../shared/agent/contracts.ts";
import type { ChatWorkspaceState, MessageView } from "../types.ts";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function upsertRun(runs: readonly RunSnapshot[], run: RunSnapshot): readonly RunSnapshot[] {
  return runs.some((item) => item.runId === run.runId)
    ? runs.map((item) => item.runId === run.runId ? run : item)
    : [run, ...runs];
}

function sameScope(left: ConversationScope, right: ConversationScope): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "global") return true;
  return right.kind === "project" && left.projectId === right.projectId;
}

export function useAgentWorkspace() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AgentServiceStatus | null>(null);
  const [projects, setProjects] = useState<ProjectSnapshot | null>(null);
  const [threads, setThreads] = useState<ThreadSnapshot | null>(null);
  const [conversationScope, setConversationScope] = useState<ConversationScope>({ kind: "global" });
  const [globalThreads, setGlobalThreads] = useState<ThreadSnapshot | null>(null);
  const [projectNavigations, setProjectNavigations] = useState<
    Readonly<Record<string, ProjectNavigationSnapshot>>
  >({});
  const [messages, setMessages] = useState<readonly MessageView[]>([]);
  const [runs, setRuns] = useState<readonly RunSnapshot[]>([]);
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const activeThreadIdRef = useRef("");
  const activeScopeRef = useRef<ConversationScope>({ kind: "global" });
  const runThreadIdsRef = useRef(new Map<string, string>());

  const loadMessages = useCallback(async (
    scope: ConversationScope,
    threadId: string,
  ) => {
    const result = await window.storyOSAgent.listConversationMessages({
      scope,
      threadId,
    });
    setMessages(result.map((message: MessageDto) => ({ ...message })));
  }, []);

  const applyWorkspaceSnapshot = useCallback(async (snapshot: WorkspaceSnapshot) => {
    const scope: ConversationScope = snapshot.projects.activeProjectId
      ? { kind: "project", projectId: snapshot.projects.activeProjectId }
      : { kind: "global" };
    activeScopeRef.current = scope;
    setConversationScope(scope);
    activeThreadIdRef.current = snapshot.threads.activeThreadId ?? "";
    setProjects(snapshot.projects);
    setThreads(snapshot.threads);
    if (scope.kind === "global") setGlobalThreads(snapshot.threads);
    if (snapshot.threads.activeThreadId) {
      await loadMessages(scope, snapshot.threads.activeThreadId);
    } else {
      setMessages([]);
    }
  }, [loadMessages]);

  const cacheConversationSnapshot = useCallback((
    scope: ConversationScope,
    snapshot: ThreadSnapshot,
  ) => {
    if (scope.kind === "global") {
      setGlobalThreads(snapshot);
      return;
    }
    setProjectNavigations((current) => {
      const navigation = current[scope.projectId];
      if (!navigation) return current;
      return {
        ...current,
        [scope.projectId]: {
          ...navigation,
          conversations: snapshot,
        },
      };
    });
  }, []);

  const applyConversationSnapshot = useCallback(async (
    scope: ConversationScope,
    snapshot: ThreadSnapshot,
  ) => {
    activeScopeRef.current = scope;
    setConversationScope(scope);
    activeThreadIdRef.current = snapshot.activeThreadId ?? "";
    setThreads(snapshot);
    cacheConversationSnapshot(scope, snapshot);
    if (snapshot.activeThreadId) {
      await loadMessages(scope, snapshot.activeThreadId);
    } else {
      setMessages([]);
    }
  }, [cacheConversationSnapshot, loadMessages]);

  const loadProjectNavigation = useCallback(async (projectId: string) => {
    const navigation = await window.storyOSAgent.getProjectNavigation(projectId);
    setProjectNavigations((current) => ({
      ...current,
      [projectId]: navigation,
    }));
    return navigation;
  }, []);

  const loadChat = useCallback(async () => {
    const workspaceSnapshot = await window.storyOSAgent.getWorkspaceSnapshot();
    const scope: ConversationScope = workspaceSnapshot.projects.activeProjectId
      ? { kind: "project", projectId: workspaceSnapshot.projects.activeProjectId }
      : { kind: "global" };
    const [runSnapshots, globalSnapshot] = await Promise.all([
      window.storyOSAgent.listConversationRuns(scope),
      window.storyOSAgent.getConversationSnapshot({ kind: "global" }),
    ]);
    setGlobalThreads(globalSnapshot.threads);
    if (scope.kind === "project") {
      await loadProjectNavigation(scope.projectId);
    }
    setRuns(runSnapshots);
    runSnapshots.forEach((run) => runThreadIdsRef.current.set(run.runId, run.threadId));
    await applyWorkspaceSnapshot(workspaceSnapshot);
  }, [applyWorkspaceSnapshot, loadProjectNavigation]);
  const handleEvent = useCallback((event: ConversationApplicationEvent) => {
    if (!sameScope(event.conversationScope, activeScopeRef.current)) return;
    if (event.type === "run_started") {
      runThreadIdsRef.current.set(event.runId, event.threadId);
      setRuns((current) => upsertRun(current, {
        runId: event.runId,
        threadId: event.threadId,
        status: "running",
        startedAt: event.timestamp,
      }));
      return;
    }

    if (event.type === "text_delta") {
      setDrafts((current) => ({
        ...current,
        [event.runId]: `${current[event.runId] ?? ""}${event.content}`,
      }));
      return;
    }

    if (event.type === "run_completed") {
      const threadId = runThreadIdsRef.current.get(event.runId) ?? "";
      setRuns((current) => {
        const existing = current.find((run) => run.runId === event.runId);
        return upsertRun(current, {
          runId: event.runId,
          threadId,
          status: "completed",
          startedAt: existing?.startedAt ?? event.timestamp,
          completedAt: event.timestamp,
          durationMs: event.durationMs,
          content: event.content,
        });
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[event.runId];
        return next;
      });
      if (threadId === activeThreadIdRef.current) {
        setMessages((current) => [...current, {
          id: `answer-${event.runId}`,
          threadId,
          role: "assistant",
          content: event.content,
          createdAt: event.timestamp,
        }]);
      }
      return;
    }

    if (event.type === "run_failed" || event.type === "run_aborted" || event.type === "run_timed_out") {
      const threadId = runThreadIdsRef.current.get(event.runId) ?? "";
      const nextStatus = event.type.replace("run_", "") as RunSnapshot["status"];
      setRuns((current) => {
        const existing = current.find((run) => run.runId === event.runId);
        return upsertRun(current, {
          runId: event.runId,
          threadId,
          status: nextStatus,
          startedAt: existing?.startedAt ?? event.timestamp,
          completedAt: event.timestamp,
          durationMs: event.durationMs,
          error: event.error,
        });
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[event.runId];
        return next;
      });
      if (event.type !== "run_aborted") setError(event.error.message);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.storyOSAgent.onEvent(handleEvent);
    void window.storyOSAgent.getStatus()
      .then(async (nextStatus) => {
        if (disposed) return;
        setStatus(nextStatus);
        if (nextStatus.initialized) await loadChat();
      })
      .catch((cause) => {
        if (!disposed) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [handleEvent, loadChat]);

  const configure = useCallback(async (request: AgentConfigurationRequest) => {
    setError(null);
    const nextStatus = await window.storyOSAgent.configure(request);
    setStatus(nextStatus);
    await loadChat();
  }, [loadChat]);

  const createThread = useCallback(async (
    scope: ConversationScope = activeScopeRef.current,
  ) => {
    setError(null);
    const thread = await window.storyOSAgent.createConversation({
      scope,
      title: "新对话",
    });
    const snapshot = await window.storyOSAgent.getConversationSnapshot(scope);
    await applyConversationSnapshot(scope, snapshot.threads);
    return thread;
  }, [applyConversationSnapshot]);

  const createProject = useCallback(async (request: CreateProjectRequest) => {
    setError(null);
    const snapshot = await window.storyOSAgent.createProject(request);
    await applyWorkspaceSnapshot(snapshot);
    if (snapshot.projects.activeProjectId) {
      await loadProjectNavigation(snapshot.projects.activeProjectId);
    }
  }, [applyWorkspaceSnapshot, loadProjectNavigation]);

  const openProject = useCallback(async (projectPath: string) => {
    setError(null);
    const snapshot = await window.storyOSAgent.openProject(projectPath);
    await applyWorkspaceSnapshot(snapshot);
    if (snapshot.projects.activeProjectId) {
      await loadProjectNavigation(snapshot.projects.activeProjectId);
    }
  }, [applyWorkspaceSnapshot, loadProjectNavigation]);
  const openProjectDirectory = useCallback(async (projectPath: string) => {
    setError(null);
    try {
      await window.storyOSAgent.openProjectDirectory(projectPath);
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, []);

  const renameProject = useCallback(async (request: RenameProjectRequest) => {
    setError(null);
    try {
      await applyWorkspaceSnapshot(await window.storyOSAgent.renameProject(request));
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [applyWorkspaceSnapshot]);

  const deleteProject = useCallback(async (projectPath: string) => {
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.deleteProject(projectPath);
      await applyWorkspaceSnapshot(snapshot);
      setProjectNavigations((current) => Object.fromEntries(
        Object.entries(current).filter(([projectId]) =>
          snapshot.projects.projects.some((project) => project.id === projectId)),
      ));
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [applyWorkspaceSnapshot]);

  const switchProject = useCallback(async (projectPath: string | null) => {
    setError(null);
    const snapshot = await window.storyOSAgent.switchProject(projectPath);
    await applyWorkspaceSnapshot(snapshot);
    if (snapshot.projects.activeProjectId) {
      await loadProjectNavigation(snapshot.projects.activeProjectId);
    }
  }, [applyWorkspaceSnapshot, loadProjectNavigation]);

  const removeProject = useCallback(async (projectPath: string) => {
    setError(null);
    await applyWorkspaceSnapshot(await window.storyOSAgent.removeProject(projectPath));
  }, [applyWorkspaceSnapshot]);
  const switchThread = useCallback(async (
    threadId: string,
    scope: ConversationScope = activeScopeRef.current,
  ) => {
    setError(null);
    const snapshot = await window.storyOSAgent.switchConversation({
      scope,
      threadId,
    });
    await applyConversationSnapshot(scope, snapshot.threads);
    setProjects(await window.storyOSAgent.getProjectSnapshot());
  }, [applyConversationSnapshot]);

  const openConversationScope = useCallback(async (
    scope: ConversationScope,
  ) => {
    setError(null);
    const [snapshot, runSnapshots, projectSnapshot] = await Promise.all([
      window.storyOSAgent.getConversationSnapshot(scope),
      window.storyOSAgent.listConversationRuns(scope),
      window.storyOSAgent.getProjectSnapshot(),
    ]);
    setRuns(runSnapshots);
    runThreadIdsRef.current.clear();
    runSnapshots.forEach((run) =>
      runThreadIdsRef.current.set(run.runId, run.threadId));
    setProjects(projectSnapshot);
    await applyConversationSnapshot(scope, snapshot.threads);
    return snapshot.threads;
  }, [applyConversationSnapshot]);

  const deleteThread = useCallback(async (
    threadId: string,
    scope: ConversationScope = activeScopeRef.current,
  ) => {
    setError(null);
    const snapshot = await window.storyOSAgent.deleteConversation({
      scope,
      threadId,
    });
    await applyConversationSnapshot(scope, snapshot.threads);
    return snapshot.threads;
  }, [applyConversationSnapshot]);

  const sendMessage = useCallback(async (content: string) => {
    const threadId = activeThreadIdRef.current;
    const normalized = content.trim();
    if (!threadId || !normalized) return;
    setError(null);
    setMessages((current) => [...current, {
      id: `local-${crypto.randomUUID()}`,
      threadId,
      role: "user",
      content: normalized,
      createdAt: new Date().toISOString(),
    }]);
    try {
      const { runId } = await window.storyOSAgent.sendConversationMessage({
        scope: activeScopeRef.current,
        threadId,
        content: normalized,
      });
      runThreadIdsRef.current.set(runId, threadId);
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, []);

  const cancelRun = useCallback(async (runId: string) => {
    await window.storyOSAgent.cancelConversationRun(activeScopeRef.current, runId);
  }, []);

  const activeThreadId = threads?.activeThreadId ?? "";
  const draftMessages = Object.entries(drafts)
    .filter(([runId]) => runThreadIdsRef.current.get(runId) === activeThreadId)
    .map(([runId, content]): MessageView => ({
      id: `draft-${runId}`,
      threadId: activeThreadId,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      streaming: true,
    }));
  const visibleMessages = useMemo(
    () => [...messages, ...draftMessages],
    [messages, drafts, activeThreadId],
  );
  const activeRun = runs.find((run) =>
    run.threadId === activeThreadId && (run.status === "running" || run.status === "cancelling"));

  const state: ChatWorkspaceState = {
    loading,
    status,
    projects,
    threads,
    conversationScope,
    globalThreads,
    projectNavigations,
    messages: visibleMessages,
    runs,
    error,
  };

  return {
    state,
    activeRun,
    configure,
    createProject,
    openProject,
    openProjectDirectory,
    renameProject,
    deleteProject,
    switchProject,
    loadProjectNavigation,
    removeProject,
    createThread,
    openConversationScope,
    switchThread,
    deleteThread,
    sendMessage,
    cancelRun,
    clearError: () => setError(null),
  };
}
