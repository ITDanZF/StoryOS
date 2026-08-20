import { Extension } from "@tiptap/core";
import type { Attrs, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

type ParagraphFormat = {
  readonly lineHeight?: string | null;
  readonly firstLineIndent?: string | null;
  readonly indentLeft?: string | null;
  readonly indentRight?: string | null;
  readonly spaceBefore?: string | null;
  readonly spaceAfter?: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphFormatting: {
      setParagraphFormat: (format: ParagraphFormat) => ReturnType;
      adjustParagraphIndent: (deltaEm: number) => ReturnType;
    };
  }
}

const FORMATTED_BLOCKS = new Set(["paragraph", "heading"]);

function selectedTextblocks(
  state: EditorState,
): readonly { readonly node: ProseMirrorNode; readonly position: number }[] {
  const result = new Map<number, ProseMirrorNode>();
  const { from, to, $from } = state.selection;
  state.doc.nodesBetween(from, to, (node, position) => {
    if (node.isTextblock && FORMATTED_BLOCKS.has(node.type.name)) {
      result.set(position, node);
      return false;
    }
    return true;
  });
  if ($from.parent.isTextblock && FORMATTED_BLOCKS.has($from.parent.type.name)) {
    result.set($from.before($from.depth), $from.parent);
  }
  return [...result].map(([position, node]) => ({ node, position }));
}

function updateSelectedTextblocks(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  update: (attributes: Attrs) => Attrs,
): boolean {
  const blocks = selectedTextblocks(state);
  if (blocks.length === 0) return false;
  if (!dispatch) return true;
  const transaction = state.tr;
  for (const block of blocks) {
    transaction.setNodeMarkup(
      block.position,
      undefined,
      update(block.node.attrs),
      block.node.marks,
    );
  }
  dispatch(transaction.scrollIntoView());
  return true;
}

function styleAttribute(
  cssProperty: string,
  value: unknown,
): Record<string, string> {
  return typeof value === "string" && value
    ? { style: `${cssProperty}: ${value}` }
    : {};
}

const ParagraphFormattingExtension = Extension.create({
  name: "paragraphFormatting",

  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
          renderHTML: (attributes: Attrs) =>
            styleAttribute("line-height", attributes.lineHeight),
        },
        firstLineIndent: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.textIndent || null,
          renderHTML: (attributes: Attrs) =>
            styleAttribute("text-indent", attributes.firstLineIndent),
        },
        indentLeft: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.marginLeft || null,
          renderHTML: (attributes: Attrs) =>
            styleAttribute("margin-left", attributes.indentLeft),
        },
        indentRight: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.marginRight || null,
          renderHTML: (attributes: Attrs) =>
            styleAttribute("margin-right", attributes.indentRight),
        },
        spaceBefore: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.marginTop || null,
          renderHTML: (attributes: Attrs) =>
            styleAttribute("margin-top", attributes.spaceBefore),
        },
        spaceAfter: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.marginBottom || null,
          renderHTML: (attributes: Attrs) =>
            styleAttribute("margin-bottom", attributes.spaceAfter),
        },
      },
    }];
  },

  addCommands() {
    return {
      setParagraphFormat:
        (format: ParagraphFormat) =>
        ({ state, dispatch }) => updateSelectedTextblocks(
          state,
          dispatch,
          (attributes) => ({ ...attributes, ...format }),
        ),
      adjustParagraphIndent:
        (deltaEm: number) =>
        ({ state, dispatch }) => updateSelectedTextblocks(
          state,
          dispatch,
          (attributes) => {
            const current = typeof attributes.indentLeft === "string"
              ? Number.parseFloat(attributes.indentLeft)
              : 0;
            const next = Math.max(0, (Number.isFinite(current) ? current : 0) + deltaEm);
            return {
              ...attributes,
              indentLeft: next > 0 ? `${next}em` : null,
            };
          },
        ),
    };
  },
});

export default ParagraphFormattingExtension;
