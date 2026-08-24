import type { EditorView } from "@tiptap/pm/view";
import {
  chapterPaginationStageHeight,
  type ChapterPageSpec,
} from "./paginationModel.ts";

export type PaginationVerification = {
  readonly valid: boolean;
  readonly expectedHeight: number;
  readonly actualHeight: number;
  readonly overflow: number;
  readonly error?: string;
};

function numericStyle(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function measurePaginationContentHeight(view: EditorView): number {
  const rootRect = view.dom.getBoundingClientRect();
  const rootStyle = window.getComputedStyle(view.dom);
  const lastBlock = view.dom.lastElementChild;
  if (!(lastBlock instanceof HTMLElement)) {
    return numericStyle(rootStyle.paddingTop) +
      numericStyle(rootStyle.paddingBottom);
  }
  const blockStyle = window.getComputedStyle(lastBlock);
  return Math.max(
    0,
    lastBlock.getBoundingClientRect().bottom - rootRect.top +
      numericStyle(blockStyle.marginBottom) +
      numericStyle(rootStyle.paddingBottom),
  );
}

export function verifyPaginationProjection(
  view: EditorView,
  pageCount: number,
  pageSpec: ChapterPageSpec,
): PaginationVerification {
  // scrollHeight includes the paper projection's CSS min-height. Measuring the
  // final content block keeps projection output out of verification input.
  return verifyPaginationProjectionHeight(
    measurePaginationContentHeight(view),
    pageCount,
    pageSpec,
  );
}

export function verifyPaginationProjectionHeight(
  actualHeight: number,
  pageCount: number,
  pageSpec: ChapterPageSpec,
): PaginationVerification {
  const expectedHeight = chapterPaginationStageHeight(pageCount, pageSpec);
  const overflow = Math.max(0, actualHeight - expectedHeight);
  if (overflow > 1) {
    return {
      valid: false,
      expectedHeight,
      actualHeight,
      overflow,
      error: `正文超出最后一页 ${Math.ceil(overflow)}px，分页结果未提交。`,
    };
  }
  return { valid: true, expectedHeight, actualHeight, overflow: 0 };
}
