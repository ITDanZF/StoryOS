import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentConfigurationRequest,
  AgentServiceStatus,
  ConversationApplicationEvent,
  ConversationScope,
  ConversationTurnContext,
  CreateProjectRequest,
  MessageDto,
  ProjectSnapshot,
  ProjectNavigationSnapshot,
  RenameProjectRequest,
  RunSnapshot,
  ThreadSnapshot,
  ToolApprovalDecision,
  WorkspaceSnapshot,
} from "../../../../shared/agent/contracts.ts";
import type {
  ChatWorkspaceState,
  MessageView,
  PendingToolApprovalView,
  ToolActivityView,
} from "../types.ts";

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
  const [pendingApprovals, setPendingApprovals] =
    useState<readonly PendingToolApprovalView[]>([]);
  const [toolActivities, setToolActivities] =
    useState<readonly ToolActivityView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeThreadIdRef = useRef("");
  const activeScopeRef = useRef<ConversationScope>({ kind: "global" });
  const runThreadIdsRef = useRef(new Map<string, string>());
  const conversationTransitionRef = useRef(0);
  const messageLoadRef = useRef(0);
  const beginConversationTransition = useCallback(() => {
    messageLoadRef.current += 1;
    conversationTransitionRef.current += 1;
    return conversationTransitionRef.current;
  }, []);

  const loadMessages = useCallback(async (
    scope: ConversationScope,
    threadId: string,
  ) => {
    const requestId = ++messageLoadRef.current;
    const result = await window.storyOSAgent.listConversationMessages({
      scope,
      threadId,
    });
    if (
      requestId !== messageLoadRef.current ||
      !sameScope(scope, activeScopeRef.current) ||
      threadId !== activeThreadIdRef.current
    ) return;
    setMessages(result.map((message: MessageDto) => ({ ...message })));
  }, []);

  const applyWorkspaceSnapshot = useCallback(async (
    snapshot: WorkspaceSnapshot,
    transitionId: number,
  ) => {
    if (transitionId !== conversationTransitionRef.current) return false;
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
      messageLoadRef.current += 1;
      setMessages([]);
    }
    return true;
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
    transitionId: number,
  ) => {
    if (transitionId !== conversationTransitionRef.current) return false;
    activeScopeRef.current = scope;
    setConversationScope(scope);
    activeThreadIdRef.current = snapshot.activeThreadId ?? "";
    setThreads(snapshot);
    cacheConversationSnapshot(scope, snapshot);
    if (snapshot.activeThreadId) {
      await loadMessages(scope, snapshot.activeThreadId);
    } else {
      messageLoadRef.current += 1;
      setMessages([]);
    }
    return true;
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
    const transitionId = beginConversationTransition();
    const workspaceSnapshot = await window.storyOSAgent.getWorkspaceSnapshot();
    const scope: ConversationScope = workspaceSnapshot.projects.activeProjectId
      ? { kind: "project", projectId: workspaceSnapshot.projects.activeProjectId }
      : { kind: "global" };
    const [runSnapshots, globalSnapshot] = await Promise.all([
      window.storyOSAgent.listConversationRuns(scope),
      window.storyOSAgent.getConversationSnapshot({ kind: "global" }),
    ]);
    if (transitionId !== conversationTransitionRef.current) return;
    setGlobalThreads(globalSnapshot.threads);
    if (scope.kind === "project") {
      await loadProjectNavigation(scope.projectId);
    }
    setRuns(runSnapshots);
    runSnapshots.forEach((run) => runThreadIdsRef.current.set(run.runId, run.threadId));
    await applyWorkspaceSnapshot(workspaceSnapshot, transitionId);
  }, [applyWorkspaceSnapshot, beginConversationTransition, loadProjectNavigation]);
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

    if (event.type === "approval_requested") {
      const threadId = runThreadIdsRef.current.get(event.runId) ?? "";
      setPendingApprovals((current) => [
        ...current.filter((item) => item.approvalId !== event.approvalId),
        {
          approvalId: event.approvalId,
          runId: event.runId,
          threadId,
          conversationScope: event.conversationScope,
          toolName: event.toolName,
          summary: event.summary,
          preview: event.preview,
          requestedAt: event.timestamp,
        },
      ]);
      return;
    }

    if (event.type === "approval_resolved") {
      setPendingApprovals((current) => current.filter(
        (item) => item.approvalId !== event.approvalId,
      ));
      return;
    }

    if (event.type === "tool_status") {
      const id = `${event.runId}:${event.toolName}`;
      const threadId = runThreadIdsRef.current.get(event.runId) ?? "";
      setToolActivities((current) => [
        ...current.filter((item) => item.id !== id),
        {
          id,
          runId: event.runId,
          threadId,
          toolName: event.toolName,
          summary: event.summary,
          status: event.status,
          ...(event.error ? { error: event.error } : {}),
          updatedAt: event.timestamp,
        },
      ]);
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
      setPendingApprovals((current) => current.filter(
        (item) => item.runId !== event.runId,
      ));
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
      setPendingApprovals((current) => current.filter(
        (item) => item.runId !== event.runId,
      ));
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
    const transitionId = beginConversationTransition();
    setError(null);
    const thread = await window.storyOSAgent.createConversation({
      scope,
      title: "新对话",
    });
    const snapshot = await window.storyOSAgent.getConversationSnapshot(scope);
    await applyConversationSnapshot(scope, snapshot.threads, transitionId);
    return thread;
  }, [applyConversationSnapshot, beginConversationTransition]);

  const createProject = useCallback(async (request: CreateProjectRequest) => {
    const transitionId = beginConversationTransition();
    setError(null);
    const snapshot = await window.storyOSAgent.createProject(request);
    const applied = await applyWorkspaceSnapshot(snapshot, transitionId);
    if (applied && snapshot.projects.activeProjectId) {
      await loadProjectNavigation(snapshot.projects.activeProjectId);
    }
  }, [applyWorkspaceSnapshot, beginConversationTransition, loadProjectNavigation]);

  const openProject = useCallback(async (projectPath: string) => {
    const transitionId = beginConversationTransition();
    setError(null);
    const snapshot = await window.storyOSAgent.openProject(projectPath);
    const applied = await applyWorkspaceSnapshot(snapshot, transitionId);
    if (applied && snapshot.projects.activeProjectId) {
      await loadProjectNavigation(snapshot.projects.activeProjectId);
    }
  }, [applyWorkspaceSnapshot, beginConversationTransition, loadProjectNavigation]);
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
    const transitionId = beginConversationTransition();
    setError(null);
    try {
      await applyWorkspaceSnapshot(
        await window.storyOSAgent.renameProject(request),
        transitionId,
      );
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [applyWorkspaceSnapshot, beginConversationTransition]);

  const deleteProject = useCallback(async (projectPath: string) => {
    const transitionId = beginConversationTransition();
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.deleteProject(projectPath);
      const applied = await applyWorkspaceSnapshot(snapshot, transitionId);
      if (!applied) return;
      setProjectNavigations((current) => Object.fromEntries(
        Object.entries(current).filter(([projectId]) =>
          snapshot.projects.projects.some((project) => project.id === projectId)),
      ));
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [applyWorkspaceSnapshot, beginConversationTransition]);

  const switchProject = useCallback(async (projectPath: string | null) => {
    const transitionId = beginConversationTransition();
    setError(null);
    const snapshot = await window.storyOSAgent.switchProject(projectPath);
    const applied = await applyWorkspaceSnapshot(snapshot, transitionId);
    if (applied && snapshot.projects.activeProjectId) {
      await loadProjectNavigation(snapshot.projects.activeProjectId);
    }
  }, [applyWorkspaceSnapshot, beginConversationTransition, loadProjectNavigation]);

  const removeProject = useCallback(async (projectPath: string) => {
    const transitionId = beginConversationTransition();
    setError(null);
    await applyWorkspaceSnapshot(
      await window.storyOSAgent.removeProject(projectPath),
      transitionId,
    );
  }, [applyWorkspaceSnapshot, beginConversationTransition]);
  const switchThread = useCallback(async (
    threadId: string,
    scope: ConversationScope = activeScopeRef.current,
  ) => {
    const transitionId = beginConversationTransition();
    setError(null);
    const snapshot = await window.storyOSAgent.switchConversation({
      scope,
      threadId,
    });
    const applied = await applyConversationSnapshot(
      scope,
      snapshot.threads,
      transitionId,
    );
    const projectSnapshot = await window.storyOSAgent.getProjectSnapshot();
    if (applied && transitionId === conversationTransitionRef.current) {
      setProjects(projectSnapshot);
    }
  }, [applyConversationSnapshot, beginConversationTransition]);

  const openConversationScope = useCallback(async (
    scope: ConversationScope,
  ) => {
    const transitionId = beginConversationTransition();
    setError(null);
    const [snapshot, runSnapshots, projectSnapshot] = await Promise.all([
      window.storyOSAgent.getConversationSnapshot(scope),
      window.storyOSAgent.listConversationRuns(scope),
      window.storyOSAgent.getProjectSnapshot(),
    ]);
    if (transitionId !== conversationTransitionRef.current) {
      return snapshot.threads;
    }
    setRuns(runSnapshots);
    runThreadIdsRef.current.clear();
    runSnapshots.forEach((run) =>
      runThreadIdsRef.current.set(run.runId, run.threadId));
    setProjects(projectSnapshot);
    await applyConversationSnapshot(scope, snapshot.threads, transitionId);
    return snapshot.threads;
  }, [applyConversationSnapshot, beginConversationTransition]);

  const deleteThread = useCallback(async (
    threadId: string,
    scope: ConversationScope = activeScopeRef.current,
  ) => {
    const transitionId = beginConversationTransition();
    setError(null);
    const snapshot = await window.storyOSAgent.deleteConversation({
      scope,
      threadId,
    });
    await applyConversationSnapshot(scope, snapshot.threads, transitionId);
    return snapshot.threads;
  }, [applyConversationSnapshot, beginConversationTransition]);

  const sendMessage = useCallback(async (
    content: string,
    context?: ConversationTurnContext,
  ) => {
    const threadId = activeThreadIdRef.current;
    const normalized = content.trim();
    if (!threadId || !normalized) return;
    setError(null);
    const localMessageId = `local-${crypto.randomUUID()}`;
    setMessages((current) => [...current, {
      id: localMessageId,
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
        ...(context ? { context } : {}),
      });
      runThreadIdsRef.current.set(runId, threadId);
    } catch (cause) {
      setMessages((current) => current.filter(
        (message) => message.id !== localMessageId,
      ));
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, []);

  const cancelRun = useCallback(async (runId: string) => {
    await window.storyOSAgent.cancelConversationRun(activeScopeRef.current, runId);
  }, []);

  const resolveApproval = useCallback(async (
    approvalId: string,
    decision: ToolApprovalDecision,
  ) => {
    const approval = pendingApprovals.find(
      (item) => item.approvalId === approvalId,
    );
    if (!approval) throw new Error(`Approval not found: ${approvalId}`);
    setError(null);
    try {
      const resolved = await window.storyOSAgent.resolveConversationApproval(
        approval.conversationScope,
        approvalId,
        decision,
      );
      if (!resolved) throw new Error("该工具审批已经失效，请重新发起操作。");
      setPendingApprovals((current) => current.filter(
        (item) => item.approvalId !== approvalId,
      ));
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [pendingApprovals]);

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
    pendingApprovals,
    toolActivities,
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
    resolveApproval,
    clearError: () => setError(null),
  };
}
