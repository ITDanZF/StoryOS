import { describe, expect, it } from "vitest";
import type { ChapterPaginationSnapshot } from "./paginationModel.ts";
import { chapterPageAtPosition } from "./useChapterPagination.ts";

const snapshot: ChapterPaginationSnapshot = {
  generation: 1,
  layoutKey: "test",
  status: "ready",
  pages: [
    {
      index: 0,
      from: 1,
      to: 10,
      usedHeight: 100,
      breakReason: "automatic",
      overflow: false,
    },
    {
      index: 1,
      from: 10,
      to: 20,
      usedHeight: 100,
      breakReason: "document-end",
      overflow: false,
    },
  ],
};

describe("chapter page selection", () => {
  it("assigns a shared page boundary to the page that starts there", () => {
    expect(chapterPageAtPosition(snapshot, 10)).toBe(1);
  });

  it("keeps positions before the boundary on the earlier page", () => {
    expect(chapterPageAtPosition(snapshot, 9)).toBe(0);
  });

  it("handles an unmeasured chapter as its first page", () => {
    expect(chapterPageAtPosition({ ...snapshot, pages: [] }, 10)).toBe(0);
  });
});
