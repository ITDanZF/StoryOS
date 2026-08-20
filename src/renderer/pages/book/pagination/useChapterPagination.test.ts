import { getSchema } from "@tiptap/core";
import StarterKitExtension from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import PageBreakExtension from "../editor/PageBreakExtension.ts";
import type { ChapterPaginationSnapshot } from "./paginationModel.ts";
import {
  chapterPageAtPosition,
  chapterPageContainsPosition,
  editablePositionInChapterPage,
} from "./useChapterPagination.ts";

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

  it("does not treat a following page position as part of the clicked page", () => {
    expect(chapterPageContainsPosition(snapshot, 0, 9)).toBe(true);
    expect(chapterPageContainsPosition(snapshot, 0, 10)).toBe(false);
    expect(chapterPageContainsPosition(snapshot, 1, 10)).toBe(true);
  });

  it("resolves an empty manual page to its own editable paragraph", () => {
    const schema = getSchema([StarterKitExtension, PageBreakExtension]);
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "pageBreak" },
        { type: "paragraph" },
        { type: "pageBreak" },
        { type: "paragraph", content: [{ type: "text", text: "y" }] },
      ],
    });
    const manualSnapshot: ChapterPaginationSnapshot = {
      generation: 1,
      layoutKey: "empty-page-test",
      status: "ready",
      pages: [
        { index: 0, from: 1, to: 3, usedHeight: 10, breakReason: "manual", overflow: false },
        { index: 1, from: 4, to: 6, usedHeight: 10, breakReason: "manual", overflow: false },
        { index: 2, from: 7, to: 9, usedHeight: 10, breakReason: "document-end", overflow: false },
      ],
    };

    expect(chapterPageContainsPosition(manualSnapshot, 1, 8)).toBe(false);
    expect(editablePositionInChapterPage(
      document,
      manualSnapshot,
      1,
      "start",
    )).toBe(5);
    expect(editablePositionInChapterPage(
      document,
      manualSnapshot,
      1,
      "end",
    )).toBe(5);
  });
});
