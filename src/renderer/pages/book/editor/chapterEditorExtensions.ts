import { Placeholder } from "@tiptap/extensions";
import TextAlignExtension from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import UnderlineExtension from "@tiptap/extension-underline";
import StarterKitExtension from "@tiptap/starter-kit";
import {
  ChapterPaginationController,
  ChapterPaginationExtension,
} from "../pagination/ChapterPaginationExtension.ts";
import ChapterPasteExtension from "./clipboard/ChapterPasteExtension.ts";
import ParagraphFormattingExtension from "./formatting/ParagraphFormattingExtension.ts";
import PageBreakExtension from "./PageBreakExtension.ts";
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
    StarterKitExtension.configure({
      heading: {
        levels: [2, 3],
      },
      underline: false,
      codeBlock: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        defaultProtocol: "https",
      },
    }),
    UnderlineExtension,
    TextAlignExtension.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
    }),
    TextStyleKit.configure({
      backgroundColor: {},
      color: {},
      lineHeight: false,
    }),
    ParagraphFormattingExtension,
    FindReplaceExtension,
    ChapterPasteExtension,
    PageBreakExtension,
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
