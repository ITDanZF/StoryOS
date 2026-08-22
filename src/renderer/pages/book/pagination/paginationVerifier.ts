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

export function verifyPaginationProjection(
  view: EditorView,
  pageCount: number,
  pageSpec: ChapterPageSpec,
): PaginationVerification {
  const expectedHeight = chapterPaginationStageHeight(pageCount, pageSpec);
  const actualHeight = view.dom.scrollHeight;
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
