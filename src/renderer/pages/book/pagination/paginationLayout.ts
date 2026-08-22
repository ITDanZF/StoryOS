import {
  CHAPTER_PAGE_SPEC,
  type ChapterPageSpec,
} from "./paginationModel.ts";

export type ChapterTypographySpec = {
  readonly bodyFontFamily: string;
  readonly bodyFontSize: number;
  readonly bodyLineHeight: number;
  readonly letterSpacingEm: number;
};

export type ChapterPaginationLayout = {
  readonly layoutVersion: number;
  readonly page: ChapterPageSpec;
  readonly typography: ChapterTypographySpec;
};

export const CHAPTER_TYPOGRAPHY_SPEC: ChapterTypographySpec = Object.freeze({
  bodyFontFamily:
    '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", STSong, SimSun, "Times New Roman", serif',
  bodyFontSize: 17,
  bodyLineHeight: 1.9,
  letterSpacingEm: 0.02,
});

export const CHAPTER_PAGINATION_LAYOUT: ChapterPaginationLayout =
  Object.freeze({
    layoutVersion: 3,
    page: CHAPTER_PAGE_SPEC,
    typography: CHAPTER_TYPOGRAPHY_SPEC,
  });

export type ChapterPaginationCssVariables = Record<
  `--chapter-${string}`,
  string
>;

export function chapterPaginationCssVariables(
  layout: ChapterPaginationLayout = CHAPTER_PAGINATION_LAYOUT,
): ChapterPaginationCssVariables {
  const { page, typography } = layout;
  return {
    "--chapter-page-width": `${page.width}px`,
    "--chapter-page-height": `${page.height}px`,
    "--chapter-page-margin-top": `${page.marginTop}px`,
    "--chapter-page-margin-right": `${page.marginRight}px`,
    "--chapter-page-margin-bottom": `${page.marginBottom}px`,
    "--chapter-page-margin-left": `${page.marginLeft}px`,
    "--chapter-page-gap": `${page.pageGap}px`,
    "--chapter-body-font-family": typography.bodyFontFamily,
    "--chapter-body-font-size": `${typography.bodyFontSize}px`,
    "--chapter-body-line-height": String(typography.bodyLineHeight),
    "--chapter-body-letter-spacing": `${typography.letterSpacingEm}em`,
  };
}

export function applyChapterPaginationLayout(
  element: HTMLElement,
  layout: ChapterPaginationLayout = CHAPTER_PAGINATION_LAYOUT,
): void {
  for (const [property, value] of Object.entries(
    chapterPaginationCssVariables(layout),
  )) {
    element.style.setProperty(property, value);
  }
}

export function createPaginationLayoutFingerprint(
  layout: ChapterPaginationLayout = CHAPTER_PAGINATION_LAYOUT,
): string {
  const { page, typography } = layout;
  return [
    layout.layoutVersion,
    page.layoutVersion,
    page.width,
    page.height,
    page.marginTop,
    page.marginRight,
    page.marginBottom,
    page.marginLeft,
    typography.bodyFontFamily,
    typography.bodyFontSize,
    typography.bodyLineHeight,
    typography.letterSpacingEm,
  ].join(":");
}

const PARITY_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
] as const;

export function assertChapterPaginationLayoutParity(
  visible: HTMLElement,
  replica: HTMLElement,
): void {
  const visibleStyle = window.getComputedStyle(visible);
  const replicaStyle = window.getComputedStyle(replica);
  const mismatches = PARITY_PROPERTIES.filter(
    (property) => visibleStyle[property] !== replicaStyle[property],
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Pagination layout replica differs from the editor: ${mismatches.join(", ")}.`,
    );
  }
}
