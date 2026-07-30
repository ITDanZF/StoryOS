import { describe, expect, it } from "vitest";
import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";
import {
  clampChapterEditablePosition,
  createChapterPaginationCacheKey,
  numberBookPages,
  type ChapterPageMeasurement,
} from "./bookPagination.ts";

function chapter(
  id: string,
  content: string,
  revisionId: string | null,
): BookWorkspaceChapterDto {
  return {
    id,
    novelId: "novel-1",
    volumeId: "volume-1",
    title: id,
    status: "draft",
    sortOrder: 0,
    currentRevisionId: revisionId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    content,
    characterCount: content.length,
    revisionNumber: revisionId ? 1 : null,
  };
}

function page(
  chapterId: string,
  chapterPageNumber: number,
): ChapterPageMeasurement {
  return {
    key: `${chapterId}:${chapterPageNumber}`,
    chapterId,
    revisionId: "revision-1",
    chapterPageNumber,
    from: chapterPageNumber - 1,
    to: chapterPageNumber,
    previewText: `${chapterId}-${chapterPageNumber}`,
  };
}

describe("book pagination", () => {
  it("keeps the structural document end out of editable page coordinates", () => {
    expect(clampChapterEditablePosition(100, 100)).toBe(99);
    expect(clampChapterEditablePosition(0, 2)).toBe(1);
  });

  it("numbers measured chapter pages continuously across the book", () => {
    const chapters = [
      chapter("chapter-1", "first", "revision-1"),
      chapter("chapter-2", "second", "revision-2"),
    ];
    const measurements = new Map([
      ["chapter-1", [page("chapter-1", 1), page("chapter-1", 2)]],
      ["chapter-2", [page("chapter-2", 1)]],
    ]);

    const pages = numberBookPages(chapters, measurements);

    expect(pages.map((item) => item.globalPageNumber)).toEqual([1, 2, 3]);
    expect(pages.map((item) => item.chapterId)).toEqual([
      "chapter-1",
      "chapter-1",
      "chapter-2",
    ]);
  });

  it("does not number later chapters before an earlier chapter is measured", () => {
    const chapters = [
      chapter("chapter-1", "first", "revision-1"),
      chapter("chapter-2", "second", "revision-2"),
    ];
    const measurements = new Map([
      ["chapter-2", [page("chapter-2", 1)]],
    ]);

    expect(numberBookPages(chapters, measurements)).toEqual([]);
  });

  it("invalidates the pagination cache when content changes", () => {
    const before = chapter("chapter-1", "before", "revision-1");
    const after = { ...before, content: "after" };

    expect(createChapterPaginationCacheKey(before))
      .not.toBe(createChapterPaginationCacheKey(after));
  });
});
