import { Placeholder } from "@tiptap/extensions";
import TextAlignExtension from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import UnderlineExtension from "@tiptap/extension-underline";
import StarterKitExtension from "@tiptap/starter-kit";
import {
  ChapterPaginationController,
  ChapterPaginationExtension,
} from "../pagination/ChapterPaginationExtension.ts";
import PageBreakExtension from "./PageBreakExtension.ts";

export function createChapterEditorExtensions(
  paginationController?: ChapterPaginationController,
) {
  return [
    StarterKitExtension.configure({
      heading: {
        levels: [2, 3],
      },
      underline: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    UnderlineExtension,
    TextAlignExtension.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right"],
    }),
    TextStyleKit.configure({
      backgroundColor: false,
      color: false,
      lineHeight: false,
    }),
    PageBreakExtension,
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
