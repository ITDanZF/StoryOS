import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  ChapterPage,
  ChapterPaginationSnapshot,
} from "./paginationModel.ts";

type MovablePageRange = {
  readonly from: number;
  readonly to: number;
};

function movablePageRange(
  document: ProseMirrorNode,
  page: ChapterPage,
): MovablePageRange {
  let from = page.from;
  let to = page.to;
  document.forEach((node, offset) => {
    const blockStart = offset;
    const contentStart = blockStart + 1;
    const blockEnd = blockStart + node.nodeSize;
    const contentEnd = blockEnd - 1;
    if (from === contentStart) from = blockStart;
    if (to === contentStart) to = blockStart;
    else if (to === contentEnd) to = blockEnd;
  });
  return { from, to };
}

export function appendChapterPage(editor: Editor): boolean {
  const documentEnd = editor.state.doc.content.size;
  return editor.commands.insertContentAt(documentEnd, [
    { type: "pageBreak" },
    { type: "paragraph" },
  ]);
}

export function moveChapterPage(
  editor: Editor,
  snapshot: ChapterPaginationSnapshot,
  sourceChapterPageNumber: number,
  targetChapterPageNumber: number,
): boolean {
  const sourceIndex = sourceChapterPageNumber - 1;
  const targetIndex = targetChapterPageNumber - 1;
  if (sourceIndex === targetIndex) return false;
  const sourcePage = snapshot.pages[sourceIndex];
  const targetPage = snapshot.pages[targetIndex];
  if (!sourcePage || !targetPage) {
    return false;
  }

  const { state, view } = editor;
  const sourceRange = movablePageRange(state.doc, sourcePage);
  const targetRange = movablePageRange(state.doc, targetPage);
  if (sourceRange.from >= sourceRange.to) return false;
  const sourceSlice = state.doc.slice(sourceRange.from, sourceRange.to);
  let transaction = state.tr.delete(sourceRange.from, sourceRange.to);
  const targetBoundary = sourceIndex < targetIndex
    ? targetRange.to
    : targetRange.from;
  const insertionPosition = transaction.mapping.map(
    targetBoundary,
    sourceIndex < targetIndex ? -1 : 1,
  );
  transaction = transaction.replaceRange(
    insertionPosition,
    insertionPosition,
    sourceSlice,
  );
  view.dispatch(transaction);
  return true;
}

export function deleteChapterPage(
  editor: Editor,
  snapshot: ChapterPaginationSnapshot,
  chapterPageNumber: number,
): boolean {
  const pageIndex = chapterPageNumber - 1;
  const page = snapshot.pages[pageIndex];
  if (!page) return false;

  const { state, view } = editor;
  const range = movablePageRange(state.doc, page);
  let from = range.from;
  let to = range.to;
  const previousPage = snapshot.pages[pageIndex - 1];
  const nextPage = snapshot.pages[pageIndex + 1];
  if (previousPage?.breakReason === "manual") {
    from = Math.min(from, previousPage.to);
  } else if (page.breakReason === "manual" && nextPage) {
    to = Math.max(to, nextPage.from);
  }
  if (from >= to) return false;

  view.dispatch(state.tr.delete(from, to));
  return true;
}
