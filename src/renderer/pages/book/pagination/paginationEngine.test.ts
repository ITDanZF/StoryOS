import { describe, expect, it } from "vitest";
import { paginateFragments } from "./paginationEngine.ts";
import type { PaginationFragment } from "./paginationModel.ts";

function fragment(
  key: string,
  from: number,
  to: number,
  height: number,
  options: Partial<PaginationFragment> = {},
): PaginationFragment {
  return {
    key,
    from,
    to,
    height,
    kind: "paragraph-line",
    ...options,
  };
}

describe("pagination engine", () => {
  it("keeps content that exactly fills the page together", () => {
    const pages = paginateFragments({
      fragments: [fragment("a", 1, 2, 40), fragment("b", 2, 3, 60)],
      contentHeight: 100,
      documentStart: 1,
      documentEnd: 3,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ from: 1, to: 3, usedHeight: 100 });
  });

  it("starts a new page before an overflowing fragment", () => {
    const pages = paginateFragments({
      fragments: [fragment("a", 1, 2, 70), fragment("b", 2, 3, 40)],
      contentHeight: 100,
      documentStart: 1,
      documentEnd: 3,
    });

    expect(pages.map((page) => [page.from, page.to])).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it("honors manual page breaks without persisting automatic nodes", () => {
    const pages = paginateFragments({
      fragments: [
        fragment("a", 1, 2, 20),
        fragment("break", 2, 3, 0, { kind: "manual-break" }),
        fragment("b", 3, 4, 20),
      ],
      contentHeight: 100,
      documentStart: 1,
      documentEnd: 4,
    });

    expect(pages.map((page) => page.breakReason)).toEqual([
      "manual",
      "document-end",
    ]);
    expect(pages.map((page) => [page.from, page.to])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("moves a heading with its following fragment", () => {
    const pages = paginateFragments({
      fragments: [
        fragment("body", 1, 2, 70),
        fragment("heading", 2, 3, 20, {
          kind: "heading",
          keepWithNext: true,
        }),
        fragment("next", 3, 4, 20),
      ],
      contentHeight: 100,
      documentStart: 1,
      documentEnd: 4,
    });

    expect(pages.map((page) => [page.from, page.to])).toEqual([
      [1, 2],
      [2, 4],
    ]);
  });

  it("places an oversized atomic fragment once and marks overflow", () => {
    const pages = paginateFragments({
      fragments: [fragment("atomic", 1, 2, 140, { kind: "atomic" })],
      contentHeight: 100,
      documentStart: 1,
      documentEnd: 2,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0].overflow).toBe(true);
  });

  it("rejects unordered fragments", () => {
    expect(() => paginateFragments({
      fragments: [fragment("a", 3, 4, 20), fragment("b", 1, 2, 20)],
      contentHeight: 100,
      documentStart: 1,
      documentEnd: 4,
    })).toThrow("out of order");
  });
});
