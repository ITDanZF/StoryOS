import { getErrorMessage } from "../../lib/error.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BookWorkspaceSnapshot,
  CreateBookRequest,
  ReadyBookWorkspaceSnapshot,
  UpdateBookRequest,
} from "../../../shared/agent/contracts.ts";


function requireReadyWorkspace(
  snapshot: BookWorkspaceSnapshot,
): ReadyBookWorkspaceSnapshot {
  if (snapshot.state !== "ready") {
    throw new Error("请先创建书籍并填写书名。");
  }
  return snapshot;
}

export default function useBookWorkspace(projectId: string | undefined) {
  const [workspace, setWorkspace] = useState<BookWorkspaceSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const draftVersions = useRef(new Map<string, number>());
  const writes = useRef(new Map<string, Promise<unknown>>());
  const enqueue = useCallback(
    <T>(chapterId: string, operation: () => Promise<T>): Promise<T> => {
      const next = (writes.current.get(chapterId) ?? Promise.resolve())
        .catch((): void => undefined)
        .then(operation);
      writes.current.set(chapterId, next);
      return next;
    },
    [],
  );
  const writeDraft = useCallback(
    async (
      chapterId: string,
      content: string,
      baseRevisionId: string | null,
    ) => {
      if (!projectId) throw new Error("Project id is required.");
      const current = workspaceRef.current;
      if (current?.state !== "ready")
        throw new Error("Book workspace is not ready.");
      const chapter = current.chapters.find((c) => c.id === chapterId);
      if (!chapter) throw new Error("Chapter is not loaded.");
      const expectedDraftVersion =
        draftVersions.current.get(chapterId) ??
        chapter.draft?.draftVersion ??
        0;
      const draft = await window.storyOSAgent.chapterDraft({
        action: "save",
        projectId,
        chapterId,
        content,
        baseRevisionId,
        expectedDraftVersion,
      });
      if (!draft) throw new Error("Draft save returned no result.");
      draftVersions.current.set(chapterId, draft.draftVersion);
      return draft;
    },
    [projectId],
  );
  const saveChapterDraft = useCallback(
    (chapterId: string, content: string, baseRevisionId: string | null) =>
      enqueue(chapterId, () =>
        writeDraft(chapterId, content, baseRevisionId),
      ).then((): void => undefined),
    [enqueue, writeDraft],
  );

  const applySnapshot = useCallback((snapshot: BookWorkspaceSnapshot) => {
    setWorkspace((previous) =>
      snapshot.state === "ready" &&
      previous?.state === "ready" &&
      snapshot.book.id === previous.book.id
        ? {
            ...snapshot,
            chapters: snapshot.chapters.map((chapter) => {
              const cached = previous.chapters.find(
                (c) => c.id === chapter.id && c.contentLoaded,
              );
              if (!cached) return chapter;
              const sameRevision =
                cached.currentRevisionId === chapter.currentRevisionId;
              return {
                ...chapter,
                content: cached.content,
                draft: sameRevision ? cached.draft : chapter.draft,
                contentLoaded: true,
              };
            }),
          }
        : snapshot,
    );
  }, []);
  const loadChapter = useCallback(
    async (chapterId: string) => {
      if (!projectId) throw new Error("Project id is required.");
      try {
        const chapter = await window.storyOSAgent.getBookChapterContent({
          projectId,
          chapterId,
        });
        setWorkspace((current) =>
          current?.state === "ready"
            ? {
                ...current,
                chapters: current.chapters.map((c) =>
                  c.id === chapter.id &&
                  current.book.id === chapter.novelId &&
                  chapter.rowVersion >= c.rowVersion
                    ? chapter
                    : c,
                ),
              }
            : current,
        );
        return chapter;
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const load = useCallback(async () => {
    if (!projectId) return null;
    const requestId = ++loadRequestRef.current;
    setError(null);
    try {
      const snapshot = await window.storyOSAgent.getBookWorkspace(projectId);
      if (requestId === loadRequestRef.current) applySnapshot(snapshot);
      return snapshot;
    } catch (cause) {
      if (requestId === loadRequestRef.current)
        setError(getErrorMessage(cause));
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
    void window.storyOSAgent
      .getBookWorkspace(projectId)
      .then((snapshot) => {
        if (!disposed && requestId === loadRequestRef.current) {
          applySnapshot(snapshot);
        }
      })
      .catch((cause) => {
        if (!disposed && requestId === loadRequestRef.current) {
          setError(getErrorMessage(cause));
        }
      })
      .finally(() => {
        if (!disposed && requestId === loadRequestRef.current)
          setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

  const createChapter = useCallback(
    async (volumeId: string, title: string) => {
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
        applySnapshot(ready);
        return (
          ready.chapters.find((item) => !existingIds.has(item.id)) ??
          ready.chapters.at(-1) ??
          null
        );
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId, workspace],
  );

  const createBookProfile = useCallback(
    async (input: Omit<CreateBookRequest, "projectId">) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const snapshot = await window.storyOSAgent.createBook({
          projectId,
          ...input,
        });
        const ready = requireReadyWorkspace(snapshot);
        applySnapshot(ready);
        return ready;
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const createVolume = useCallback(
    async (title: string) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const snapshot = await window.storyOSAgent.createBookVolume({
          projectId,
          title,
        });
        const ready = requireReadyWorkspace(snapshot);
        applySnapshot(ready);
        return ready.volumes.at(-1) ?? null;
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const deleteVolume = useCallback(
    async (volumeId: string) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const snapshot = await window.storyOSAgent.deleteBookVolume({
          projectId,
          volumeId,
        });
        applySnapshot(snapshot);
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const deleteChapter = useCallback(
    async (chapterId: string) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const snapshot = await window.storyOSAgent.deleteBookChapter({
          projectId,
          chapterId,
        });
        applySnapshot(snapshot);
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const updateBookProfile = useCallback(
    async (input: Omit<UpdateBookRequest, "projectId">) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const current = workspaceRef.current;
        if (current?.state !== "ready")
          throw new Error("Book workspace is not ready.");
        const snapshot = await window.storyOSAgent.updateBook({
          expectedRowVersion: current.book.rowVersion,
          projectId,
          ...input,
        });
        applySnapshot(requireReadyWorkspace(snapshot));
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const updateChapterTitle = useCallback(
    async (chapterId: string, title: string) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const current = workspaceRef.current;
        if (current?.state !== "ready")
          throw new Error("Book workspace is not ready.");
        const snapshot = await window.storyOSAgent.updateBookChapter({
          expectedRowVersion: current.chapters.find((c) => c.id === chapterId)
            ?.rowVersion,
          projectId,
          chapterId,
          title,
        });
        applySnapshot(snapshot);
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId],
  );

  const saveChapterContent = useCallback(
    async (
      chapterId: string,
      content: string,
      expectedCurrentRevisionId: string | null,
    ) => {
      if (!projectId) throw new Error("Project id is required.");
      setError(null);
      try {
        const result = await enqueue(chapterId, async () => {
          const draft = await writeDraft(
            chapterId,
            content,
            expectedCurrentRevisionId,
          );
          const current = workspaceRef.current;
          const chapter =
            current?.state === "ready"
              ? current.chapters.find((c) => c.id === chapterId)
              : null;
          if (!chapter?.rowVersion)
            throw new Error("Chapter version is missing; reload the book.");
          const saved = await window.storyOSAgent.saveBookChapterContent({
            projectId,
            chapterId,
            content,
            expectedCurrentRevisionId,
            expectedRowVersion: chapter.rowVersion,
            expectedDraftVersion: draft.draftVersion,
          });
          draftVersions.current.set(chapterId, 0);
          return saved;
        });
        setWorkspace((current) =>
          current?.state === "ready"
            ? {
                ...current,
                chapters: current.chapters.map((chapter) =>
                  chapter.id === result.chapter.id ? result.chapter : chapter,
                ),
              }
            : current,
        );
        return result;
      } catch (cause) {
        setError(getErrorMessage(cause));
        throw cause;
      }
    },
    [projectId, enqueue, writeDraft],
  );

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
    saveChapterDraft,
    loadChapter,
  };
}
