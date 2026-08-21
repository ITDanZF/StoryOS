import type { MarkType, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type {
  EditorStyleChange,
  EditorTargetedStyleOperation,
  EditorTextRange,
} from "../../../../../main/agent/tools/editor/contracts.ts";
import { resolveEditorTargetSelector } from "./richTextTargeting.ts";

export type ResolvedEditorStyleOperation = {
  readonly style: EditorStyleChange;
  readonly ranges: readonly EditorTextRange[];
};

export type EditorStyleTransactionResult = {
  readonly transaction: Transaction;
  readonly operations: readonly ResolvedEditorStyleOperation[];
  readonly targetCount: number;
};

const MAX_TARGETS_PER_TRANSACTION = 1_000;

function requireMarkType(state: EditorState, name: string): MarkType {
  const mark = state.schema.marks[name];
  if (!mark) throw new Error(`Editor mark is not available: ${name}.`);
  return mark;
}

function updateTextStyleAttribute(
  transaction: Transaction,
  range: EditorTextRange,
  attribute: "color" | "backgroundColor",
  value: string | null,
  textStyle: MarkType,
): void {
  const segments: Array<{
    readonly from: number;
    readonly to: number;
    readonly attributes: Record<string, unknown>;
  }> = [];
  transaction.doc.nodesBetween(range.from, range.to, (node, position) => {
    if (!node.isText) return true;
    const from = Math.max(range.from, position);
    const to = Math.min(range.to, position + node.nodeSize);
    if (to <= from) return false;
    const current = node.marks.find((mark) => mark.type === textStyle);
    segments.push({
      from,
      to,
      attributes: { ...(current?.attrs ?? {}), [attribute]: value },
    });
    return false;
  });

  for (const segment of segments) {
    transaction.removeMark(segment.from, segment.to, textStyle);
    const hasVisibleAttribute = Object.values(segment.attributes).some(
      (entry) => entry !== null && entry !== undefined && entry !== "",
    );
    if (hasVisibleAttribute) {
      transaction.addMark(
        segment.from,
        segment.to,
        textStyle.create(segment.attributes),
      );
    }
  }
}

function selectedTextblocks(
  document: ProseMirrorNode,
  ranges: readonly EditorTextRange[],
): readonly number[] {
  const positions = new Set<number>();
  for (const range of ranges) {
    document.nodesBetween(range.from, range.to, (node, position) => {
      if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
        positions.add(position);
        return false;
      }
      return true;
    });
  }
  return [...positions].sort((left, right) => left - right);
}

function applyParagraphStyle(
  transaction: Transaction,
  ranges: readonly EditorTextRange[],
  style: Extract<EditorStyleChange, { readonly kind: "paragraph" }>,
): void {
  for (const position of selectedTextblocks(transaction.doc, ranges)) {
    const node = transaction.doc.nodeAt(position);
    if (!node) continue;
    const currentIndent = typeof node.attrs.indentLeft === "string"
      ? Number.parseFloat(node.attrs.indentLeft)
      : 0;
    const nextIndent = style.indentDelta === undefined
      ? node.attrs.indentLeft
      : Math.max(
          0,
          (Number.isFinite(currentIndent) ? currentIndent : 0) + style.indentDelta,
        );
    transaction.setNodeMarkup(position, undefined, {
      ...node.attrs,
      ...(style.lineHeight === undefined
        ? {}
        : { lineHeight: style.lineHeight }),
      ...(style.firstLineIndent === undefined
        ? {}
        : { firstLineIndent: style.firstLineIndent ? "2em" : null }),
      ...(style.indentDelta === undefined
        ? {}
        : { indentLeft: nextIndent > 0 ? `${nextIndent}em` : null }),
    }, node.marks);
  }
}

function applyStyle(
  state: EditorState,
  transaction: Transaction,
  ranges: readonly EditorTextRange[],
  style: EditorStyleChange,
): void {
  if (style.kind === "paragraph") {
    applyParagraphStyle(transaction, ranges, style);
    return;
  }
  if (style.kind === "clear_inline") {
    ranges.forEach((range) => transaction.removeMark(range.from, range.to));
    return;
  }
  if (style.kind === "mark") {
    const mark = requireMarkType(state, style.mark);
    ranges.forEach((range) => {
      if (style.enabled) transaction.addMark(range.from, range.to, mark.create());
      else transaction.removeMark(range.from, range.to, mark);
    });
    return;
  }
  if (style.kind === "link") {
    if (style.href && !/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(style.href.trim())) {
      throw new Error(
        "Only safe HTTP(S), mail, telephone, anchor, or relative links are allowed.",
      );
    }
    const link = requireMarkType(state, "link");
    ranges.forEach((range) => {
      transaction.removeMark(range.from, range.to, link);
      if (style.href) {
        transaction.addMark(
          range.from,
          range.to,
          link.create({ href: style.href.trim() }),
        );
      }
    });
    return;
  }

  const textStyle = requireMarkType(state, "textStyle");
  const attribute = style.kind === "text_color"
    ? "color"
    : "backgroundColor";
  ranges.forEach((range) => updateTextStyleAttribute(
    transaction,
    range,
    attribute,
    style.value,
    textStyle,
  ));
}

export function buildEditorStyleTransaction(
  state: EditorState,
  operations: readonly EditorTargetedStyleOperation[],
): EditorStyleTransactionResult {
  const resolved = operations.map((operation) => ({
    style: operation.style,
    ranges: resolveEditorTargetSelector(
      state.doc,
      state.selection,
      operation.selector,
    ),
  }));
  const targetCount = resolved.reduce(
    (total, operation) => total + operation.ranges.length,
    0,
  );
  if (resolved.some((operation) => operation.ranges.length === 0)) {
    throw new Error("Every editor style operation must resolve at least one target.");
  }
  if (targetCount > MAX_TARGETS_PER_TRANSACTION) {
    throw new Error(
      `Editor style request exceeds the ${MAX_TARGETS_PER_TRANSACTION}-target limit.`,
    );
  }

  const transaction = state.tr;
  resolved.forEach((operation) => applyStyle(
    state,
    transaction,
    operation.ranges,
    operation.style,
  ));
  return { transaction, operations: resolved, targetCount };
}
