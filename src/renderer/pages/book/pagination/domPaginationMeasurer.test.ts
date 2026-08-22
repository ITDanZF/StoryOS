import { describe, expect, it } from "vitest";
import { normalizePaginationBoundaries } from "./domPaginationMeasurer.ts";

describe("DOM pagination geometry normalization", () => {
  it("uses cumulative browser geometry instead of summing CSS estimates", () => {
    const fragments = normalizePaginationBoundaries([
      {
        key: "line-1",
        from: 1,
        to: 2,
        bottom: 132,
        kind: "paragraph-line",
      },
      {
        key: "line-2",
        from: 2,
        to: 3,
        bottom: 164,
        kind: "paragraph-line",
      },
      {
        key: "line-3",
        from: 3,
        to: 4,
        bottom: 203.5,
        kind: "paragraph-line",
      },
    ], 100);

    expect(fragments.map((fragment) => fragment.height)).toEqual([
      32,
      32,
      39.5,
    ]);
  });

  it("does not let a zero-height manual break corrupt later geometry", () => {
    const fragments = normalizePaginationBoundaries([
      {
        key: "line-1",
        from: 1,
        to: 2,
        bottom: 132,
        kind: "paragraph-line",
      },
      {
        key: "break",
        from: 2,
        to: 3,
        bottom: 0,
        kind: "manual-break",
      },
      {
        key: "line-2",
        from: 3,
        to: 4,
        bottom: 164,
        kind: "paragraph-line",
      },
    ], 100);

    expect(fragments.map((fragment) => fragment.height)).toEqual([32, 0, 32]);
  });
});
