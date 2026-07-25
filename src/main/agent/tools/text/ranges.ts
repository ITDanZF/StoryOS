export type TextPosition = {
  readonly line: number;
  readonly column: number;
};

export type TextRange = {
  readonly start: TextPosition;
  readonly end: TextPosition;
};

export type ResolvedTextRange = {
  readonly start: number;
  readonly end: number;
};

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function positionToOffset(
  content: string,
  position: TextPosition,
): number {
  if (!Number.isInteger(position.line) || position.line < 1) {
    throw new Error("Line must be a positive integer.");
  }
  if (!Number.isInteger(position.column) || position.column < 1) {
    throw new Error("Column must be a positive integer.");
  }

  const starts = lineStarts(content);
  const start = starts[position.line - 1];
  if (start === undefined) {
    throw new Error(`Line ${position.line} is outside the text.`);
  }
  const nextStart = starts[position.line];
  const lineEnd = nextStart === undefined
    ? content.length
    : nextStart - 1;
  const offset = start + position.column - 1;
  if (offset > lineEnd) {
    throw new Error(
      `Column ${position.column} is outside line ${position.line}. Maximum column is ${lineEnd - start + 1}.`,
    );
  }
  return offset;
}

export function offsetToPosition(
  content: string,
  offset: number,
): TextPosition {
  if (!Number.isInteger(offset) || offset < 0 || offset > content.length) {
    throw new Error("Text offset is outside the text.");
  }
  const before = content.slice(0, offset);
  const lastBreak = before.lastIndexOf("\n");
  const line = before.split("\n").length;
  const column = offset - lastBreak;
  return Object.freeze({ line, column });
}

export function resolveTextRange(
  content: string,
  range: TextRange,
): ResolvedTextRange {
  const start = positionToOffset(content, range.start);
  const end = positionToOffset(content, range.end);
  if (end < start) {
    throw new Error("Range end must not be before range start.");
  }
  return Object.freeze({ start, end });
}

export function rangesOverlap(
  first: ResolvedTextRange,
  second: ResolvedTextRange,
): boolean {
  if (first.start === first.end && second.start === second.end) {
    return first.start === second.start;
  }
  if (first.start === first.end) {
    return first.start > second.start && first.start < second.end;
  }
  if (second.start === second.end) {
    return second.start > first.start && second.start < first.end;
  }
  return first.start < second.end && second.start < first.end;
}
