import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentConfigurationRequest,
  AgentServiceStatus,
  ApplicationEvent,
  CreateProjectRequest,
  MessageDto,
  ProjectSnapshot,
  RunSnapshot,
  ThreadSnapshot,
} from "../../shared/agent/contracts.ts";
import type { ChatWorkspaceState, MessageView } from "./types.ts";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function upsertRun(runs: readonly RunSnapshot[], run: RunSnapshot): readonly RunSnapshot[] {
  return runs.some((item) => item.runId === run.runId)
    ? runs.map((item) => item.runId === run.runId ? run : item)
    : [run, ...runs];
}

export function useAgentWorkspace() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AgentServiceStatus | null>(null);
  const [projects, setProjects] = useState<ProjectSnapshot | null>(null);
  const [threads, setThreads] = useState<ThreadSnapshot | null>(null);
  const [messages, setMessages] = useState<readonly MessageView[]>([]);
  const [runs, setRuns] = useState<readonly RunSnapshot[]>([]);
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const activeThreadIdRef = useRef("");
  const activeProjectPathRef = useRef<string | null>(null);
  const runThreadIdsRef = useRef(new Map<string, string>());

  const loadMessages = useCallback(async (threadId: string) => {
    const result = await window.storyOSAgent.listMessages(threadId);
    setMessages(result.map((message: MessageDto) => ({ ...message })));
  }, []);

  const loadChat = useCallback(async () => {
    const [projectSnapshot, runSnapshots] = await Promise.all([
      window.storyOSAgent.getProjectSnapshot(),
      window.storyOSAgent.listRuns(),
    ]);
    const threadSnapshot = await window.storyOSAgent.getThreadSnapshot(projectSnapshot.activeProjectPath);
    activeProjectPathRef.current = projectSnapshot.activeProjectPath;
    activeThreadIdRef.current = threadSnapshot.activeThreadId;
    setProjects(projectSnapshot);
    setThreads(threadSnapshot);
    setRuns(runSnapshots);
    runSnapshots.forEach((run) => runThreadIdsRef.current.set(run.runId, run.threadId));
    await loadMessages(threadSnapshot.activeThreadId);
  }, [loadMessages]);

  const handleEvent = useCallback((event: ApplicationEvent) => {
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

  const createThread = useCallback(async () => {
    setError(null);
    const projectPath = activeProjectPathRef.current;
    const thread = await window.storyOSAgent.createThread("新对话", projectPath);
    const snapshot = await window.storyOSAgent.getThreadSnapshot(projectPath);
    activeThreadIdRef.current = thread.id;
    setThreads(snapshot);
    setMessages([]);
  }, []);

  const createProject = useCallback(async (request: CreateProjectRequest) => {
    setError(null);
    const project = await window.storyOSAgent.createProject(request);
    const [projectSnapshot, threadSnapshot] = await Promise.all([
      window.storyOSAgent.getProjectSnapshot(),
      window.storyOSAgent.getThreadSnapshot(project.path),
    ]);
    activeProjectPathRef.current = projectSnapshot.activeProjectPath;
    activeThreadIdRef.current = threadSnapshot.activeThreadId;
    setProjects(projectSnapshot);
    setThreads(threadSnapshot);
    await loadMessages(threadSnapshot.activeThreadId);
  }, [loadMessages]);

  const openProject = useCallback(async (projectPath: string) => {
    setError(null);
    const project = await window.storyOSAgent.openProject(projectPath);
    const [projectSnapshot, threadSnapshot] = await Promise.all([
      window.storyOSAgent.getProjectSnapshot(),
      window.storyOSAgent.getThreadSnapshot(project.path),
    ]);
    activeProjectPathRef.current = projectSnapshot.activeProjectPath;
    activeThreadIdRef.current = threadSnapshot.activeThreadId;
    setProjects(projectSnapshot);
    setThreads(threadSnapshot);
    await loadMessages(threadSnapshot.activeThreadId);
  }, [loadMessages]);

  const switchProject = useCallback(async (projectPath: string | null) => {
    setError(null);
    const projectSnapshot = await window.storyOSAgent.switchProject(projectPath);
    const threadSnapshot = await window.storyOSAgent.getThreadSnapshot(projectSnapshot.activeProjectPath);
    activeProjectPathRef.current = projectSnapshot.activeProjectPath;
    activeThreadIdRef.current = threadSnapshot.activeThreadId;
    setProjects(projectSnapshot);
    setThreads(threadSnapshot);
    await loadMessages(threadSnapshot.activeThreadId);
  }, [loadMessages]);

  const removeProject = useCallback(async (projectPath: string) => {
    setError(null);
    const projectSnapshot = await window.storyOSAgent.removeProject(projectPath);
    const threadSnapshot = await window.storyOSAgent.getThreadSnapshot(projectSnapshot.activeProjectPath);
    activeProjectPathRef.current = projectSnapshot.activeProjectPath;
    activeThreadIdRef.current = threadSnapshot.activeThreadId;
    setProjects(projectSnapshot);
    setThreads(threadSnapshot);
    await loadMessages(threadSnapshot.activeThreadId);
  }, [loadMessages]);

  const switchThread = useCallback(async (threadId: string) => {
    setError(null);
    await window.storyOSAgent.switchThread(threadId);
    const snapshot = await window.storyOSAgent.getThreadSnapshot(activeProjectPathRef.current);
    activeThreadIdRef.current = threadId;
    setThreads(snapshot);
    await loadMessages(threadId);
  }, [loadMessages]);

  const deleteThread = useCallback(async (threadId: string) => {
    setError(null);
    await window.storyOSAgent.deleteThread(threadId);
    const snapshot = await window.storyOSAgent.getThreadSnapshot(activeProjectPathRef.current);
    activeThreadIdRef.current = snapshot.activeThreadId;
    setThreads(snapshot);
    await loadMessages(snapshot.activeThreadId);
  }, [loadMessages]);

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
      const { runId } = await window.storyOSAgent.sendMessage({ threadId, content: normalized });
      runThreadIdsRef.current.set(runId, threadId);
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, []);

  const cancelRun = useCallback(async (runId: string) => {
    await window.storyOSAgent.cancelRun(runId);
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
    switchProject,
    removeProject,
    createThread,
    switchThread,
    deleteThread,
    sendMessage,
    cancelRun,
    clearError: () => setError(null),
  };
}
