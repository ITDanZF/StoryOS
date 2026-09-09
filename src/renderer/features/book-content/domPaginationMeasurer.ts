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

type MeasuredBoundary = Omit<PaginationFragment, "height"> & {
  readonly bottom: number;
};

function coordinatesAtPosition(
  view: EditorView,
  position: number,
): LogicalCoordinates {
  const coordinates = view.coordsAtPos(position, 1);
  return { top: coordinates.top, bottom: coordinates.bottom };
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
): readonly MeasuredBoundary[] {
  const contentStart = position + 1;
  const contentEnd = position + node.nodeSize - 1;
  const dom = view.nodeDOM(position);
  const element = dom instanceof HTMLElement ? dom : null;
  const elementRect = element?.getBoundingClientRect();
  const kind = fragmentKind(node, parent);
  const blockKey = `${position}:${node.type.name}`;

  if (contentStart >= contentEnd) {
    return [{
      key: `${position}:empty`,
      from: contentStart,
      to: contentEnd,
      bottom: Math.max(
        elementRect?.bottom ?? 0,
        coordinatesAtPosition(view, contentStart).bottom,
      ),
      kind,
      keepWithNext: kind === "heading",
      blockKey,
      lineIndex: 0,
      lineCount: 1,
    }];
  }

  const lines: Omit<MeasuredBoundary, "lineCount">[] = [];
  let lineStart = contentStart;
  while (lineStart < contentEnd) {
    const startCoordinates = coordinatesAtPosition(view, lineStart);
    const threshold = startCoordinates.top + 1;
    let low = lineStart + 1;
    let high = contentEnd;
    let nextLineStart = contentEnd;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (coordinatesAtPosition(view, middle).top > threshold) {
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
    const isLast = nextLineStart >= contentEnd;
    lines.push({
      key: `${position}:${lineStart}`,
      from: lineStart,
      to: nextLineStart,
      bottom: Math.max(
        lineEndCoordinates.bottom,
        isLast ? elementRect?.bottom ?? 0 : 0,
      ),
      kind,
      keepWithNext: kind === "heading" && isLast,
      blockKey,
      lineIndex: lines.length,
    });
    lineStart = nextLineStart;
  }

  if (kind === "heading") {
    const last = lines[lines.length - 1];
    return [{
      ...last,
      key: `${position}:heading`,
      from: lines[0].from,
      lineIndex: 0,
      lineCount: 1,
      keepWithNext: true,
    }];
  }
  return lines.map((line) => ({ ...line, lineCount: lines.length }));
}

export function normalizePaginationBoundaries(
  boundaries: readonly MeasuredBoundary[],
  contentTop: number,
): readonly PaginationFragment[] {
  let previousBottom = contentTop;
  return boundaries.map((boundary) => {
    if (boundary.kind === "manual-break") {
      return { ...boundary, height: 0 };
    }
    const bottom = Math.max(previousBottom, boundary.bottom);
    const height = Math.max(1, bottom - previousBottom);
    previousBottom = bottom;
    return { ...boundary, height };
  });
}

export function measurePaginationFragments(
  view: EditorView,
): readonly PaginationFragment[] {
  const boundaries: MeasuredBoundary[] = [];
  view.state.doc.descendants((node, position, parent) => {
    if (node.type.name === "pageBreak") {
      boundaries.push({
        key: `${position}:manual-break`,
        from: position,
        to: position + node.nodeSize,
        bottom: 0,
        kind: "manual-break",
      });
      return false;
    }
    if (node.isTextblock) {
      boundaries.push(...measureTextBlock(view, node, position, parent));
      return false;
    }
    if (node.isBlock && node.isAtom) {
      const dom = view.nodeDOM(position);
      const element = dom instanceof HTMLElement ? dom : null;
      const rect = element?.getBoundingClientRect();
      boundaries.push({
        key: `${position}:atomic`,
        from: position,
        to: position + node.nodeSize,
        bottom: rect?.bottom ?? coordinatesAtPosition(view, position).bottom,
        kind: "atomic",
        blockKey: `${position}:atomic`,
      });
      return false;
    }
    return true;
  });

  const rootRect = view.dom.getBoundingClientRect();
  const rootStyle = window.getComputedStyle(view.dom);
  const contentTop = rootRect.top + numericStyle(rootStyle.paddingTop);
  return normalizePaginationBoundaries(boundaries, contentTop);
}
