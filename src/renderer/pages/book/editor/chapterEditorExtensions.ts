import { Placeholder } from "@tiptap/extensions";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKitExtension from "@tiptap/starter-kit";

export function createChapterEditorExtensions() {
  return [
    StarterKitExtension.configure({
      heading: {
        levels: [2, 3],
      },
      underline: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right"],
    }),
    TextStyleKit.configure({
      backgroundColor: false,
      color: false,
      lineHeight: false,
    }),
    Placeholder.configure({
      placeholder: "在这里开始书写章节正文……",
    }),
  ];
}
