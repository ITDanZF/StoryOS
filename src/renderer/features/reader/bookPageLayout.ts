import type { PageSize } from "./bookPresentation.ts";

export function bookPageLayout(size: PageSize) {
  const outer = Math.max(32, Math.round(size.width * .115));
  const inner = Math.max(40, Math.round(size.width * .14));
  const top = Math.max(48, Math.round(size.height * .105));
  const bottom = Math.max(48, Math.round(size.height * .11));
  return { outer, inner, width: size.width - inner - outer, top, bottom,
    chapterHeading: 96, tocTop: top + (size.height < 500 ? 80 : 124), tocBottom: bottom,
    tocRowHeight: size.height < 500 ? 56 : size.height < 760 ? 76 : 80, tocVolumeHeight: size.height < 500 ? 40 : 64,
    runningTop: Math.round(top * .43), folioBottom: Math.round(bottom * .42) };
}
