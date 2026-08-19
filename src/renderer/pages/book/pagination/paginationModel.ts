import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";

export type ChapterPageSpec = {
  readonly layoutVersion: number;
  readonly width: number;
  readonly height: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly pageGap: number;
};

export const CHAPTER_PAGE_SPEC: ChapterPageSpec = Object.freeze({
  layoutVersion: 2,
  width: 720,
  height: 960,
  marginTop: 72,
  marginRight: 72,
  marginBottom: 72,
  marginLeft: 72,
  pageGap: 28,
});

export const CHAPTER_PAGE_CONTENT_WIDTH =
  CHAPTER_PAGE_SPEC.width -
  CHAPTER_PAGE_SPEC.marginLeft -
  CHAPTER_PAGE_SPEC.marginRight;

export const CHAPTER_PAGE_CONTENT_HEIGHT =
  CHAPTER_PAGE_SPEC.height -
  CHAPTER_PAGE_SPEC.marginTop -
  CHAPTER_PAGE_SPEC.marginBottom;

export function chapterPageContentHeight(spec: ChapterPageSpec): number {
  return spec.height - spec.marginTop - spec.marginBottom;
}

export const CHAPTER_PAGE_MIN_SCALE = 0.7;
export const CHAPTER_PAGE_MAX_SCALE = 1.15;

export type PaginationFragmentKind =
  | "paragraph-line"
  | "heading"
  | "list-item"
  | "blockquote"
  | "manual-break"
  | "atomic";

export type PaginationFragment = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly height: number;
  readonly kind: PaginationFragmentKind;
  readonly keepWithNext?: boolean;
};

export type ChapterPage = {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly usedHeight: number;
  readonly breakReason: "automatic" | "manual" | "document-end";
  readonly overflow: boolean;
};

export type ChapterPaginationSnapshot = {
  readonly generation: number;
  readonly layoutKey: string;
  readonly status: "pending" | "ready" | "failed";
  readonly pages: readonly ChapterPage[];
  readonly error?: string;
};

export type LiveChapterPage = ChapterPage & {
  readonly previewText: string;
};

export type LiveChapterPagination = {
  readonly chapterId: string;
  readonly layoutKey: string;
  readonly pages: readonly LiveChapterPage[];
};

export type BookPageSlice = ChapterPage & {
  readonly key: string;
  readonly chapterId: string;
  readonly revisionId: string | null;
  readonly chapterPageNumber: number;
  readonly globalPageNumber: number;
  readonly previewText: string;
};

export type ChapterPageMeasurement = Omit<
  BookPageSlice,
  "globalPageNumber"
>;

type BookPageEditorTargetBase = {
  readonly chapterId: string;
  readonly requestId: number;
};

export type BookPageNavigationTarget = BookPageEditorTargetBase & (
  | {
    readonly kind: "navigate";
    readonly position: number;
    readonly chapterPageNumber: number;
  }
  | {
    readonly kind: "append";
    readonly chapterPageNumber: number;
  }
  | {
    readonly kind: "move";
    readonly sourceChapterPageNumber: number;
    readonly targetChapterPageNumber: number;
  }
  | {
    readonly kind: "delete";
    readonly chapterPageNumber: number;
  }
);

export function calculateChapterPageScale(
  availableWidth: number,
  availableHeight: number,
): number {
  return Math.max(
    CHAPTER_PAGE_MIN_SCALE,
    Math.min(
      CHAPTER_PAGE_MAX_SCALE,
      availableWidth / CHAPTER_PAGE_SPEC.width,
      availableHeight / CHAPTER_PAGE_SPEC.height,
    ),
  );
}

export function clampChapterEditablePosition(
  requestedPosition: number,
  documentSize: number,
): number {
  return Math.max(
    1,
    Math.min(requestedPosition, Math.max(1, documentSize - 1)),
  );
}

export function hashChapterContent(content: string): number {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createChapterPaginationCacheKey(
  chapter: BookWorkspaceChapterDto,
): string {
  return [
    chapter.id,
    chapter.currentRevisionId ?? "draft",
    chapter.revisionNumber ?? 0,
    CHAPTER_PAGE_SPEC.layoutVersion,
    chapter.content.length,
    hashChapterContent(chapter.content),
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
