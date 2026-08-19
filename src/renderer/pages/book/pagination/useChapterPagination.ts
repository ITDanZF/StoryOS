import { useSyncExternalStore } from "react";
import {
  ChapterPaginationController,
} from "./ChapterPaginationExtension.ts";
import type { ChapterPaginationSnapshot } from "./paginationModel.ts";

export function useChapterPagination(
  controller: ChapterPaginationController,
): ChapterPaginationSnapshot {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return snapshot;
}

export function chapterPageAtPosition(
  snapshot: ChapterPaginationSnapshot,
  position: number,
): number {
  if (snapshot.pages.length === 0) return 0;
  for (let pageIndex = snapshot.pages.length - 1; pageIndex >= 0; pageIndex -= 1) {
    const page = snapshot.pages[pageIndex];
    if (position >= page.from) return pageIndex;
  }
  return 0;
}
