import { describe, expect, it } from "vitest";
import { CHAPTER_PAGE_SPEC } from "./paginationModel.ts";
import { verifyPaginationProjectionHeight } from "./paginationVerifier.ts";

describe("pagination projection verification", () => {
  it("accepts content contained by the prepared paper capacity", () => {
    expect(verifyPaginationProjectionHeight(
      2936,
      3,
      CHAPTER_PAGE_SPEC,
    )).toMatchObject({ valid: true, overflow: 0 });
  });

  it("rejects final-page overflow instead of publishing it as ready", () => {
    expect(verifyPaginationProjectionHeight(
      2988,
      3,
      CHAPTER_PAGE_SPEC,
    )).toMatchObject({ valid: false, overflow: 52 });
  });
});
