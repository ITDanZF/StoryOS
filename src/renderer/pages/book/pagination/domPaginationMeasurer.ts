import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type {
  PaginationFragment,
  PaginationFragmentKind,
} from "./paginationModel.ts";

type LogicalCoordinates = {
  readonly top: number;
  readonly bottom: number;
};

function coordinatesAtPosition(
  view: EditorView,
  position: number,
): LogicalCoordinates {
  const coordinates = view.coordsAtPos(position, 1);
  return {
    top: coordinates.top,
    bottom: coordinates.bottom,
  };
}

function numericStyle(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fragmentKind(
  node: ProseMirrorNode,
  parent: ProseMirrorNode | null,
): PaginationFragmentKind {
  if (node.type.name === "heading") return "heading";
  if (parent?.type.name === "listItem") return "list-item";
  if (parent?.type.name === "blockquote") return "blockquote";
  return "paragraph-line";
}

function measureTextBlock(
  view: EditorView,
  node: ProseMirrorNode,
  position: number,
  parent: ProseMirrorNode | null,
): readonly PaginationFragment[] {
  const contentStart = position + 1;
  const contentEnd = position + node.nodeSize - 1;
  const dom = view.nodeDOM(position);
  const element = dom instanceof HTMLElement ? dom : null;
  const style = element ? window.getComputedStyle(element) : null;
  const marginTop = style ? numericStyle(style.marginTop) : 0;
  const marginBottom = style ? numericStyle(style.marginBottom) : 0;
  const configuredLineHeight = style ? numericStyle(style.lineHeight) : 0;
  const kind = fragmentKind(node, parent);

  if (contentStart >= contentEnd) {
    const rect = element?.getBoundingClientRect();
    const height = Math.max(
      configuredLineHeight,
      rect?.height ?? 0,
      1,
    ) + marginTop + marginBottom;
    return [{
      key: `${position}:empty`,
      from: contentStart,
      to: contentEnd,
      height,
      kind,
      keepWithNext: kind === "heading",
    }];
  }

  const lines: PaginationFragment[] = [];
  let lineStart = contentStart;
  while (lineStart < contentEnd) {
    const startCoordinates = coordinatesAtPosition(view, lineStart);
    const threshold = startCoordinates.top + 1;
    let low = lineStart + 1;
    let high = contentEnd;
    let nextLineStart = contentEnd;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const middleCoordinates = coordinatesAtPosition(view, middle);
      if (middleCoordinates.top > threshold) {
        nextLineStart = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }

    const lineEndCoordinates = coordinatesAtPosition(
      view,
      Math.max(lineStart, nextLineStart - 1),
    );
    const lineHeight = Math.max(
      configuredLineHeight,
      startCoordinates.bottom - startCoordinates.top,
      lineEndCoordinates.bottom - lineEndCoordinates.top,
      1,
    );
    const isFirst = lines.length === 0;
    const isLast = nextLineStart >= contentEnd;
    lines.push({
      key: `${position}:${lineStart}`,
      from: lineStart,
      to: nextLineStart,
      height: lineHeight +
        (isFirst ? marginTop : 0) +
        (isLast ? marginBottom : 0),
      kind,
      keepWithNext: kind === "heading" && isLast,
    });
    lineStart = nextLineStart;
  }
  if (kind === "heading" && lines.length > 0) {
    return [{
      key: `${position}:heading`,
      from: lines[0].from,
      to: lines[lines.length - 1].to,
      height: lines.reduce((total, line) => total + line.height, 0),
      kind,
      keepWithNext: true,
    }];
  }
  return lines;
}

export function measurePaginationFragments(
  view: EditorView,
): readonly PaginationFragment[] {
  const fragments: PaginationFragment[] = [];
  view.state.doc.descendants((node, position, parent) => {
    if (node.type.name === "pageBreak") {
      fragments.push({
        key: `${position}:manual-break`,
        from: position,
        to: position + node.nodeSize,
        height: 0,
        kind: "manual-break",
      });
      return false;
    }
    if (
      node.type.name === "blockquote" ||
      node.type.name === "bulletList" ||
      node.type.name === "orderedList"
    ) {
      const dom = view.nodeDOM(position);
      const element = dom instanceof HTMLElement ? dom : null;
      const rect = element?.getBoundingClientRect();
      const style = element ? window.getComputedStyle(element) : null;
      fragments.push({
        key: `${position}:${node.type.name}`,
        from: position,
        to: position + node.nodeSize,
        height: Math.max(rect?.height ?? 0, 1) +
          (style ? numericStyle(style.marginTop) : 0) +
          (style ? numericStyle(style.marginBottom) : 0),
        kind: node.type.name === "blockquote" ? "blockquote" : "list-item",
      });
      return false;
    }
    if (node.isTextblock) {
      fragments.push(...measureTextBlock(view, node, position, parent));
      return false;
    }
    if (node.isBlock && node.isAtom) {
      const dom = view.nodeDOM(position);
      const element = dom instanceof HTMLElement ? dom : null;
      const rect = element?.getBoundingClientRect();
      const style = element ? window.getComputedStyle(element) : null;
      fragments.push({
        key: `${position}:atomic`,
        from: position,
        to: position + node.nodeSize,
        height: Math.max(rect?.height ?? 0, 1) +
          (style ? numericStyle(style.marginTop) : 0) +
          (style ? numericStyle(style.marginBottom) : 0),
        kind: "atomic",
      });
      return false;
    }
    return true;
  });
  return fragments;
}
