import { Placeholder } from "@tiptap/extensions";
import { createChapterContentExtensions } from "../../book-content/chapterContentExtensions.ts";
import {
  ChapterPaginationController,
  ChapterPaginationExtension,
} from "../pagination/ChapterPaginationExtension.ts";
import ChapterPasteExtension from "./clipboard/ChapterPasteExtension.ts";
import FindReplaceExtension from "./search/FindReplaceExtension.ts";
import EditorShortcutExtension, {
  type EditorShortcutOptions,
} from "./shortcuts/EditorShortcutExtension.ts";

type ChapterEditorExtensionOptions = {
  readonly paginationController?: ChapterPaginationController;
  readonly shortcuts?: EditorShortcutOptions;
};

export function createChapterEditorExtensions(
  options: ChapterEditorExtensionOptions = {},
) {
  const { paginationController, shortcuts } = options;
  return [
    ...createChapterContentExtensions(),
    FindReplaceExtension,
    ChapterPasteExtension,
    shortcuts
      ? EditorShortcutExtension.configure(shortcuts)
      : EditorShortcutExtension,
    ...(paginationController
      ? [ChapterPaginationExtension.configure({
          controller: paginationController,
        })]
      : []),
    Placeholder.configure({
      placeholder: "在这里开始书写章节正文……",
    }),
  ];
}
