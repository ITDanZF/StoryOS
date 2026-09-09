import type { EditorView } from "@tiptap/pm/view";
import { measurePaginationFragments } from "../../book-content/domPaginationMeasurer.ts";
import { paginateFragments } from "../../book-content/paginationEngine.ts";
import {
  chapterPageContentHeight,
  type ChapterPage,
  type ChapterPageSpec,
} from "../../book-content/paginationModel.ts";

export function paginateEditorView(
  view: EditorView,
  pageSpec: ChapterPageSpec,
): readonly ChapterPage[] {
  const documentEnd = Math.max(1, view.state.doc.content.size - 1);
  return paginateFragments({
    fragments: measurePaginationFragments(view),
    contentHeight: chapterPageContentHeight(pageSpec),
    documentStart: 1,
    documentEnd,
    continuousFlow: true,
  });
}

export async function waitForPaginationAssets(): Promise<void> {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
