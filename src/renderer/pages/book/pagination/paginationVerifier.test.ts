import { describe, expect, it } from "vitest";
import type { EditorView } from "@tiptap/pm/view";
import { CHAPTER_PAGE_SPEC } from "./paginationModel.ts";
import { verifyPaginationProjection } from "./paginationVerifier.ts";

function viewWithHeight(scrollHeight: number): EditorView {
  return { dom: { scrollHeight } } as unknown as EditorView;
}

describe("pagination projection verification", () => {
  it("accepts content contained by the prepared paper capacity", () => {
    expect(verifyPaginationProjection(
      viewWithHeight(2936),
      3,
      CHAPTER_PAGE_SPEC,
    )).toMatchObject({ valid: true, overflow: 0 });
  });

  it("rejects final-page overflow instead of publishing it as ready", () => {
    expect(verifyPaginationProjection(
      viewWithHeight(2988),
      3,
      CHAPTER_PAGE_SPEC,
    )).toMatchObject({ valid: false, overflow: 52 });
  });
});
