import TextAlignExtension from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import UnderlineExtension from "@tiptap/extension-underline";
import StarterKitExtension from "@tiptap/starter-kit";
import ParagraphFormattingExtension from "./formatting/ParagraphFormattingExtension.ts";
import PageBreakExtension from "./PageBreakExtension.ts";

/** Shared document schema, without editor UI, persistence or clipboard plugins. */
export function createChapterContentExtensions() {
  return [
    StarterKitExtension.configure({ heading: { levels: [2, 3] }, underline: false,
      codeBlock: false, horizontalRule: false, link: { openOnClick: false, defaultProtocol: "https" } }),
    UnderlineExtension,
    TextAlignExtension.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    TextStyleKit.configure({ backgroundColor: {}, color: {}, lineHeight: false }),
    ParagraphFormattingExtension, PageBreakExtension,
  ];
}
