import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentConfigurationRequest,
  AgentServiceStatus,
  ConversationApplicationEvent,
  ConversationEvent,
  ConversationScope,
  ConversationTurnContext,
  CreateProjectRequest,
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
  PendingToolApprovalView,
  ChapterGenerationView,
} from "../types.ts";
import { ConversationEventBatcher } from "../conversation/store/conversationEventBatcher.ts";
import { conversationStore } from "../conversation/store/conversationStore.ts";

const conversationEventBatcher = new ConversationEventBatcher({
  applyEvent: (event) => conversationStore.getState().applyEvent(event),
  applyEvents: (events) => conversationStore.getState().applyEvents(events),
});

function isStructuredConversationEvent(
  event: ConversationApplicationEvent,
): event is ConversationApplicationEvent & ConversationEvent {
  return "eventId" in event && "sequence" in event;
}

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
  const [runs, setRuns] = useState<readonly RunSnapshot[]>([]);
  const [pendingApprovals, setPendingApprovals] =
    useState<readonly PendingToolApprovalView[]>([]);
  const [bookChangeVersions, setBookChangeVersions] =
    useState<Readonly<Record<string, number>>>({});
  const [chapterGenerations, setChapterGenerations] =
    useState<Readonly<Record<string, ChapterGenerationView>>>({});
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
    const conversationEvents = await window.storyOSAgent.listConversationEvents({
      scope,
      threadId,
    });
    if (
      requestId !== messageLoadRef.current ||
      !sameScope(scope, activeScopeRef.current) ||
      threadId !== activeThreadIdRef.current
    ) return;
    conversationEventBatcher.flush();
    conversationStore.getState().hydrate(conversationEvents);
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
      conversationStore.getState().reset();
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
      conversationStore.getState().reset();
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
    if (isStructuredConversationEvent(event)) {
      if (event.type === "approval.requested") {
        setPendingApprovals((current) => [
          ...current.filter((item) => item.approvalId !== event.payload.approvalId),
          {
            approvalId: event.payload.approvalId,
            runId: event.runId,
            threadId: event.threadId,
            conversationScope: event.conversationScope,
            toolName: event.payload.toolName,
            summary: event.payload.summary,
            preview: event.payload.preview,
            requestedAt: event.timestamp,
          },
        ]);
      } else if (event.type === "approval.resolved") {
        setPendingApprovals((current) => current.filter(
          (item) => item.approvalId !== event.payload.approvalId,
        ));
      }
      if (event.threadId === activeThreadIdRef.current) {
        conversationEventBatcher.enqueue(event);
      }
      return;
    }
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

    if (event.type === "book_changed") {
      setBookChangeVersions((current) => ({
        ...current,
        [event.projectId]: (current[event.projectId] ?? 0) + 1,
      }));
      return;
    }

    if (event.type === "chapter_generation_started") {
      setChapterGenerations((current) => ({
        ...current,
        [event.chapterId]: {
          generationId: event.generationId,
          projectId: event.projectId,
          chapterId: event.chapterId,
          mode: event.mode,
          initialText: event.initialText,
          generatedText: "",
          sequence: 0,
          status: "streaming",
          updatedAt: event.timestamp,
        },
      }));
      return;
    }

    if (event.type === "chapter_generation_delta") {
      setChapterGenerations((current) => {
        const existing = current[event.chapterId];
        if (
          !existing ||
          existing.generationId !== event.generationId ||
          event.sequence <= existing.sequence
        ) return current;
        return {
          ...current,
          [event.chapterId]: {
            ...existing,
            generatedText: `${existing.generatedText}${event.text}`,
            sequence: event.sequence,
            status: "streaming",
            updatedAt: event.timestamp,
          },
        };
      });
      return;
    }

    if (event.type === "chapter_generation_completed") {
      setChapterGenerations((current) => {
        const existing = current[event.chapterId];
        if (!existing || existing.generationId !== event.generationId) return current;
        return {
          ...current,
          [event.chapterId]: {
            ...existing,
            status: "completed",
            content: event.content,
            revisionNumber: event.revisionNumber,
            characterCount: event.characterCount,
            updatedAt: event.timestamp,
          },
        };
      });
      return;
    }

    if (event.type === "chapter_generation_failed") {
      setChapterGenerations((current) => {
        const existing = current[event.chapterId];
        if (!existing || existing.generationId !== event.generationId) return current;
        return {
          ...current,
          [event.chapterId]: {
            ...existing,
            status: "failed",
            error: event.error,
            updatedAt: event.timestamp,
          },
        };
      });
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
      setPendingApprovals((current) => current.filter(
        (item) => item.runId !== event.runId,
      ));
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
    try {
      const { runId } = await window.storyOSAgent.sendConversationMessage({
        scope: activeScopeRef.current,
        threadId,
        content: normalized,
        ...(context ? { context } : {}),
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
    runs,
    pendingApprovals,
    bookChangeVersions,
    chapterGenerations,
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
