import { Node, mergeAttributes } from "@tiptap/core";

const PageBreakExtension = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "true",
        role: "separator",
        "aria-label": "分页符",
      }),
    ];
  },
});

export default PageBreakExtension;
