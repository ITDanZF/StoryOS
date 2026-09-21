import { useEffect, useRef } from "react";
import type { NovelMutation } from "../../../../shared/contracts/books/novelEvents.ts";
import {
  chapterIdToRevealFromMutation,
  generationStore,
} from "../store/generationStore.ts";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;
const SYNC_COALESCE_DELAY_MS = 120;

type UseBookMutationSyncOptions = {
  readonly projectId: string | undefined;
  readonly changeVersion: number;
  readonly lastMutation: NovelMutation | null;
  readonly reloadWorkspace: () => Promise<unknown>;
  readonly reloadNavigation: (projectId: string) => Promise<unknown>;
  readonly onRevealChapter: (chapterId: string) => void;
};

export default function useBookMutationSync({
  projectId,
  changeVersion,
  lastMutation,
  reloadWorkspace,
  reloadNavigation,
  onRevealChapter,
}: UseBookMutationSyncOptions): void {
  const lastMutationRef = useRef(lastMutation);
  lastMutationRef.current = lastMutation;
  const onRevealChapterRef = useRef(onRevealChapter);
  onRevealChapterRef.current = onRevealChapter;

  useEffect(() => {
    if (!projectId || changeVersion === 0) return;

    let disposed = false;
    let retryTimer: number | null = null;
    const synchronize = async (attempt: number): Promise<void> => {
      try {
        await Promise.all([
          reloadWorkspace(),
          reloadNavigation(projectId),
        ]);
        if (disposed) return;
        const mutation = lastMutationRef.current;
        if (!mutation) return;
        const chapterId = chapterIdToRevealFromMutation(
          mutation,
          generationStore.getState().jobs,
        );
        if (chapterId) onRevealChapterRef.current(chapterId);
      } catch {
        if (disposed || attempt >= MAX_ATTEMPTS) return;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          void synchronize(attempt + 1);
        }, RETRY_DELAY_MS * attempt);
      }
    };

    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void synchronize(1);
    }, SYNC_COALESCE_DELAY_MS);
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [changeVersion, projectId, reloadNavigation, reloadWorkspace]);
}
