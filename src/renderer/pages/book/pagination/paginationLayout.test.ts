import { describe, expect, it } from "vitest";
import {
  chapterPaginationCssVariables,
  createPaginationLayoutFingerprint,
} from "./paginationLayout.ts";

describe("pagination layout contract", () => {
  it("exposes one set of page and typography variables", () => {
    expect(chapterPaginationCssVariables()).toMatchObject({
      "--chapter-page-width": "720px",
      "--chapter-page-height": "960px",
      "--chapter-body-font-size": "17px",
      "--chapter-body-line-height": "1.9",
    });
  });

  it("includes typography in the cache fingerprint", () => {
    const base = createPaginationLayoutFingerprint();
    expect(createPaginationLayoutFingerprint({
      layoutVersion: 3,
      page: {
        layoutVersion: 3,
        width: 720,
        height: 960,
        marginTop: 72,
        marginRight: 72,
        marginBottom: 72,
        marginLeft: 72,
        pageGap: 28,
      },
      typography: {
        bodyFontFamily: "serif",
        bodyFontSize: 18,
        bodyLineHeight: 1.9,
        letterSpacingEm: 0.02,
      },
    })).not.toBe(base);
  });
});
