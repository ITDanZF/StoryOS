import { useCallback, useEffect, useState } from "react";
import type {
  BookWorkspaceSnapshot,
} from "../../../shared/agent/contracts.ts";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function useBookWorkspace(projectId: string | undefined) {
  const [workspace, setWorkspace] = useState<BookWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return null;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.getBookWorkspace(projectId);
      setWorkspace(snapshot);
      return snapshot;
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    } finally {
      setLoading(false);
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
    void window.storyOSAgent.getBookWorkspace(projectId)
      .then((snapshot) => {
        if (!disposed) setWorkspace(snapshot);
      })
      .catch((cause) => {
        if (!disposed) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

  const createChapter = useCallback(async (volumeId: string | null) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    const existingIds = new Set(workspace?.chapters.map((item) => item.id));
    try {
      const snapshot = await window.storyOSAgent.createBookChapter({
        projectId,
        volumeId,
        title: "新章节",
      });
      setWorkspace(snapshot);
      return snapshot.chapters.find((item) => !existingIds.has(item.id)) ??
        snapshot.chapters.at(-1) ??
        null;
    } catch (cause) {
      setError(getErrorMessage(cause));
      throw cause;
    }
  }, [projectId, workspace?.chapters]);

  const createVolume = useCallback(async (title: string) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.createBookVolume({
        projectId,
        title,
      });
      setWorkspace(snapshot);
      return snapshot.volumes.at(-1) ?? null;
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
  ) => {
    if (!projectId) throw new Error("Project id is required.");
    setError(null);
    try {
      const result = await window.storyOSAgent.saveBookChapterContent({
        projectId,
        chapterId,
        content,
      });
      setWorkspace((current) => current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === result.chapter.id ? result.chapter : chapter),
          }
        : current);
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
    createVolume,
    createChapter,
    updateChapterTitle,
    saveChapterContent,
  };
}
