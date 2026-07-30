import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";

export const BOOK_PAGE_LAYOUT = Object.freeze({
  version: 1,
  width: 720,
  height: 960,
  paddingTop: 72,
  paddingRight: 72,
  paddingBottom: 72,
  paddingLeft: 72,
});

export const BOOK_PAGE_CONTENT_HEIGHT =
  BOOK_PAGE_LAYOUT.height -
  BOOK_PAGE_LAYOUT.paddingTop -
  BOOK_PAGE_LAYOUT.paddingBottom;

export const BOOK_PAGE_CONTENT_WIDTH =
  BOOK_PAGE_LAYOUT.width -
  BOOK_PAGE_LAYOUT.paddingLeft -
  BOOK_PAGE_LAYOUT.paddingRight;

export const BOOK_PAGE_COLUMN_GAP =
  BOOK_PAGE_LAYOUT.paddingLeft + BOOK_PAGE_LAYOUT.paddingRight;

export const BOOK_PAGE_STRIDE =
  BOOK_PAGE_CONTENT_WIDTH + BOOK_PAGE_COLUMN_GAP;

export type BookPageSlice = {
  readonly key: string;
  readonly chapterId: string;
  readonly revisionId: string | null;
  readonly chapterPageNumber: number;
  readonly globalPageNumber: number;
  readonly from: number;
  readonly to: number;
  readonly previewText: string;
};

export type BookPageNavigationTarget = {
  readonly chapterId: string;
  readonly position: number;
  readonly chapterPageNumber: number;
  readonly requestId: number;
};

export type ChapterPageMeasurement = Omit<
  BookPageSlice,
  "globalPageNumber"
>;

export function clampChapterEditablePosition(
  requestedPosition: number,
  documentSize: number,
): number {
  return Math.max(
    1,
    Math.min(requestedPosition, Math.max(1, documentSize - 1)),
  );
}

export function createChapterPaginationCacheKey(
  chapter: BookWorkspaceChapterDto,
): string {
  let hash = 2166136261;
  for (let index = 0; index < chapter.content.length; index += 1) {
    hash ^= chapter.content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return [
    chapter.id,
    chapter.currentRevisionId ?? "draft",
    chapter.revisionNumber ?? 0,
    BOOK_PAGE_LAYOUT.version,
    chapter.content.length,
    hash >>> 0,
  ].join(":");
}

export function numberBookPages(
  chapters: readonly BookWorkspaceChapterDto[],
  measurements: ReadonlyMap<string, readonly ChapterPageMeasurement[]>,
): readonly BookPageSlice[] {
  let globalPageNumber = 1;
  const pages: BookPageSlice[] = [];
  for (const chapter of chapters) {
    const chapterPages = measurements.get(chapter.id);
    if (!chapterPages) break;
    for (const page of chapterPages) {
      pages.push({ ...page, globalPageNumber });
      globalPageNumber += 1;
    }
  }
  return pages;
}
