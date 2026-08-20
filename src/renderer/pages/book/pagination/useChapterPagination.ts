import { useSyncExternalStore } from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
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

export function chapterPageContainsPosition(
  snapshot: ChapterPaginationSnapshot,
  pageIndex: number,
  position: number,
): boolean {
  const page = snapshot.pages[pageIndex];
  if (!page) return false;
  const lastPage = pageIndex === snapshot.pages.length - 1;
  return position >= page.from &&
    (lastPage ? position <= page.to : position < page.to);
}

export function editablePositionInChapterPage(
  document: ProseMirrorNode,
  snapshot: ChapterPaginationSnapshot,
  pageIndex: number,
  edge: "start" | "end",
): number | null {
  const page = snapshot.pages[pageIndex];
  if (!page) return null;
  const lastPage = pageIndex === snapshot.pages.length - 1;
  const rangeFrom = Math.max(0, Math.min(page.from, document.content.size));
  const rangeTo = Math.max(
    rangeFrom,
    Math.min(page.to, document.content.size),
  );
  const candidates: number[] = [];

  document.nodesBetween(rangeFrom, rangeTo, (node, position) => {
    if (!node.isTextblock) return true;
    const contentStart = position + 1;
    const contentEnd = position + node.nodeSize - 1;
    const candidateStart = Math.max(contentStart, page.from);
    const candidateEnd = Math.min(
      contentEnd,
      lastPage ? page.to : page.to - 1,
    );
    if (candidateStart <= candidateEnd) {
      candidates.push(edge === "start" ? candidateStart : candidateEnd);
    }
    return false;
  });

  if (candidates.length === 0) return null;
  return edge === "start" ? candidates[0] : candidates[candidates.length - 1];
}
