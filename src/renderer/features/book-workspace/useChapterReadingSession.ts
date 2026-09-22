import { useEffect, useRef, useState, type RefObject } from "react";
import type { BookWorkspaceSnapshot } from "../../../shared/agent/contracts.ts";
import type { ChapterEditorBridge } from "./editor/chapterEditorContext.ts";
import {
  findBookChapterLocation,
  flattenBookChapterGroups,
  neighborChapterIds,
  resolveDisplayedChapter,
  type BookChapterGroup,
} from "./bookWorkspaceModel.ts";

type LoadChapter = (chapterId: string) => Promise<{
  readonly id: string;
  readonly currentRevisionId: string | null;
}>;

type UseChapterReadingSessionOptions = {
  readonly projectId: string | undefined;
  readonly workspace: BookWorkspaceSnapshot | null;
  readonly activeChapterId: string | null;
  readonly chapterGroups: readonly BookChapterGroup[];
  readonly loadChapter: LoadChapter;
  readonly prefetchChapter: (chapterId: string) => Promise<unknown>;
  readonly showBookOverview: () => void;
  readonly editorBridgeRef: RefObject<ChapterEditorBridge | null>;
};

/** Keeps the previous chapter on screen until the selected chapter content arrives. */
export default function useChapterReadingSession({
  projectId,
  workspace,
  activeChapterId,
  chapterGroups,
  loadChapter,
  prefetchChapter,
  showBookOverview,
  editorBridgeRef,
}: UseChapterReadingSessionOptions) {
  const readyWorkspace = workspace?.state === "ready" ? workspace : null;
  const activeChapterLocation = findBookChapterLocation(
    chapterGroups,
    activeChapterId,
  );
  const activeChapter = activeChapterLocation?.chapter ?? null;
  const [heldChapterId, setHeldChapterId] = useState<string | null>(null);
  const showBookOverviewRef = useRef(showBookOverview);
  showBookOverviewRef.current = showBookOverview;
  const previousActiveChapterIdRef = useRef<string | null>(null);
  const prefetchStartedRef = useRef(new Set<string>());
  const chapterLoading = useRef<string | null>(null);
  const loadedContentRevision = useRef(new Map<string, string | null>());

  useEffect(() => {
    prefetchStartedRef.current = new Set();
    loadedContentRevision.current = new Map();
    setHeldChapterId(null);
  }, [projectId]);
  useEffect(() => {
    const previous = previousActiveChapterIdRef.current;
    previousActiveChapterIdRef.current = activeChapterId;
    if (previous && previous !== activeChapterId) {
      void editorBridgeRef.current?.flushPending().catch((): void => undefined);
    }
  }, [activeChapterId, editorBridgeRef]);
  useEffect(() => {
    if (!activeChapterId) {
      setHeldChapterId(null);
      return;
    }
    if (activeChapter?.contentLoaded) setHeldChapterId(activeChapter.id);
  }, [activeChapterId, activeChapter?.id, activeChapter?.contentLoaded]);

  const heldChapter =
    heldChapterId && readyWorkspace
      ? readyWorkspace.chapters.find(
          (chapter) => chapter.id === heldChapterId && chapter.contentLoaded,
        ) ?? null
      : null;
  const displayedChapter = resolveDisplayedChapter(activeChapter, heldChapter);
  const displayedLocation =
    displayedChapter?.id === activeChapterId
      ? activeChapterLocation
      : findBookChapterLocation(chapterGroups, displayedChapter?.id ?? null);

  useEffect(() => {
    if (!activeChapter) return;
    const loadedRevision = loadedContentRevision.current.get(activeChapter.id);
    if (
      activeChapter.contentLoaded &&
      loadedRevision === activeChapter.currentRevisionId
    ) return;
    const loadKey = `${activeChapter.id}:${activeChapter.currentRevisionId ?? "none"}`;
    if (chapterLoading.current === loadKey) return;
    chapterLoading.current = loadKey;
    void loadChapter(activeChapter.id)
      .then((chapter) => {
        loadedContentRevision.current.set(chapter.id, chapter.currentRevisionId);
      })
      .catch((): void => undefined)
      .finally(() => {
        if (chapterLoading.current === loadKey) chapterLoading.current = null;
      });
  }, [
    activeChapter?.id,
    activeChapter?.currentRevisionId,
    activeChapter?.contentLoaded,
    loadChapter,
  ]);
  useEffect(() => {
    if (!readyWorkspace || !activeChapterId) return;
    const neighborIds = neighborChapterIds(
      flattenBookChapterGroups(chapterGroups).map((chapter) => chapter.id),
      activeChapterId,
    );
    for (const chapterId of neighborIds) {
      const chapter = readyWorkspace.chapters.find((item) => item.id === chapterId);
      if (!chapter || chapter.contentLoaded) continue;
      if (prefetchStartedRef.current.has(chapterId)) continue;
      prefetchStartedRef.current.add(chapterId);
      void prefetchChapter(chapterId).catch(() => {
        prefetchStartedRef.current.delete(chapterId);
      });
    }
  }, [activeChapterId, chapterGroups, prefetchChapter, readyWorkspace]);
  useEffect(() => {
    if (!workspace) return;
    if (workspace.state === "uninitialized") {
      if (activeChapterId !== null) showBookOverviewRef.current();
      return;
    }
    if (
      activeChapterId &&
      workspace.chapters.some((chapter) => chapter.id === activeChapterId)
    )
      return;
    if (activeChapterId !== null) showBookOverviewRef.current();
  }, [activeChapterId, workspace]);

  return {
    displayedChapter,
    displayedLocation,
    chapterContentPending: Boolean(activeChapter && !displayedChapter),
  };
}
