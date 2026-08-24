import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BookWorkspaceSnapshot,
  CreateBookRequest,
  ReadyBookWorkspaceSnapshot,
  UpdateBookRequest,
} from "../../../shared/agent/contracts.ts";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireReadyWorkspace(
  snapshot: BookWorkspaceSnapshot,
): ReadyBookWorkspaceSnapshot {
  if (snapshot.state !== "ready") {
    throw new Error("请先创建书籍并填写书名。");
  }
  return snapshot;
}

export default function useBookWorkspace(projectId: string | undefined) {
  const [workspace, setWorkspace] = useState<BookWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (!projectId) return null;
    const requestId = ++loadRequestRef.current;
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.getBookWorkspace(projectId);
      if (requestId === loadRequestRef.current) setWorkspace(snapshot);
      return snapshot;
    } catch (cause) {
      if (requestId === loadRequestRef.current) setError(getErrorMessage(cause));
      throw cause;
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let disposed = false;
    if (!projectId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const requestId = ++loadRequestRef.current;
    void window.storyOSAgent.getBookWorkspace(projectId)
      .then((snapshot) => {
        if (!disposed && requestId === loadRequestRef.current) {
          setWorkspace(snapshot);
        }
      })
      .catch((cause) => {
        if (!disposed && requestId === loadRequestRef.current) {
          setError(getErrorMessage(cause));
        }
      })
      .finally(() => {
        if (!disposed && requestId === loadRequestRef.current) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

  const createChapter = useCallback(async (volumeId: string, title: string) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    const current = workspace ? requireReadyWorkspace(workspace) : null;
    const existingIds = new Set(current?.chapters.map((item) => item.id));
    try {
      const snapshot = await window.storyOSAgent.createBookChapter({
        projectId,
        volumeId,
        title,
      });
      const ready = requireReadyWorkspace(snapshot);
      setWorkspace(ready);
      return ready.chapters.find((item) => !existingIds.has(item.id)) ??
        ready.chapters.at(-1) ??
        null;
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId, workspace]);

  const createBookProfile = useCallback(async (
    input: Omit<CreateBookRequest, "projectId">,
  ) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.createBook({
        projectId,
        ...input,
      });
      const ready = requireReadyWorkspace(snapshot);
      setWorkspace(ready);
      return ready;
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  const createVolume = useCallback(async (title: string) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.createBookVolume({
        projectId,
        title,
      });
      const ready = requireReadyWorkspace(snapshot);
      setWorkspace(ready);
      return ready.volumes.at(-1) ?? null;
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  const deleteVolume = useCallback(async (volumeId: string) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.deleteBookVolume({
        projectId,
        volumeId,
      });
      setWorkspace(snapshot);
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  const deleteChapter = useCallback(async (chapterId: string) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.deleteBookChapter({
        projectId,
        chapterId,
      });
      setWorkspace(snapshot);
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  const updateBookProfile = useCallback(async (
    input: Omit<UpdateBookRequest, "projectId">,
  ) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.updateBook({
        projectId,
        ...input,
      });
      setWorkspace(requireReadyWorkspace(snapshot));
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  const updateChapterTitle = useCallback(async (
    chapterId: string,
    title: string,
  ) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.updateBookChapter({
        projectId,
        chapterId,
        title,
      });
      setWorkspace(snapshot);
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  const saveChapterContent = useCallback(async (
    chapterId: string,
    content: string,
    expectedCurrentRevisionId: string | null,
  ) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const result = await window.storyOSAgent.saveBookChapterContent({
        projectId,
        chapterId,
        content,
        expectedCurrentRevisionId,
      });
      setWorkspace((current) => current?.state === "ready"
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === result.chapter.id ? result.chapter : chapter),
          }
        : current);
      return result;
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId]);

  return {
    workspace,
    loading,
    error,
    load,
    createBookProfile,
    createVolume,
    createChapter,
    deleteVolume,
    deleteChapter,
    updateBookProfile,
    updateChapterTitle,
    saveChapterContent,
  };
}
