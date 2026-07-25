import { offsetToPosition } from "../ranges.ts";
import type { StructuralChunk } from "./types.ts";

const MAX_CHUNK_CHARACTERS = 2_000;
const CHUNK_OVERLAP_CHARACTERS = 160;

type LineRecord = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

function createLines(content: string): LineRecord[] {
  if (!content) return [];
  const lines: LineRecord[] = [];
  let start = 0;
  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && content[index] !== "\n") continue;
    lines.push({
      text: content.slice(start, index),
      start,
      end: index,
    });
    start = index + 1;
  }
  return lines;
}

function findChunkEnd(
  content: string,
  start: number,
  maximumEnd: number,
): number {
  if (maximumEnd >= content.length) return content.length;
  const candidate = content.slice(start, maximumEnd);
  const boundary = Math.max(
    candidate.lastIndexOf("\n"),
    candidate.lastIndexOf("。"),
    candidate.lastIndexOf("！"),
    candidate.lastIndexOf("？"),
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? "),
  );
  return boundary > MAX_CHUNK_CHARACTERS / 2
    ? start + boundary + 1
    : maximumEnd;
}

function appendBoundedChunks(
  output: StructuralChunk[],
  content: string,
  start: number,
  end: number,
  type: StructuralChunk["type"],
  headingPath: readonly string[],
): void {
  let chunkStart = start;
  while (chunkStart < end) {
    const maximumEnd = Math.min(end, chunkStart + MAX_CHUNK_CHARACTERS);
    const chunkEnd = findChunkEnd(content, chunkStart, maximumEnd);
    const chunkContent = content.slice(chunkStart, chunkEnd).trim();
    if (chunkContent) {
      const leadingWhitespace =
        content.slice(chunkStart, chunkEnd).length -
        content.slice(chunkStart, chunkEnd).trimStart().length;
      const actualStart = chunkStart + leadingWhitespace;
      const actualEnd = actualStart + chunkContent.length;
      output.push(
        Object.freeze({
          type,
          content: chunkContent,
          startOffset: actualStart,
          endOffset: actualEnd,
          start: offsetToPosition(content, actualStart),
          end: offsetToPosition(content, actualEnd),
          headingPath: Object.freeze([...headingPath]),
        }),
      );
    }
    if (chunkEnd >= end) break;
    chunkStart = Math.max(chunkStart + 1, chunkEnd - CHUNK_OVERLAP_CHARACTERS);
  }
}

export function createStructuralChunks(
  content: string,
): readonly StructuralChunk[] {
  const chunks: StructuralChunk[] = [];
  const headings: string[] = [];
  const lines = createLines(content);
  let sectionStart = -1;
  let sectionEnd = -1;

  const flushSection = () => {
    if (sectionStart < 0) return;
    appendBoundedChunks(
      chunks,
      content,
      sectionStart,
      sectionEnd,
      "section",
      headings.filter(Boolean),
    );
    sectionStart = -1;
    sectionEnd = -1;
  };

  for (const line of lines) {
    const heading = line.text.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushSection();
      const level = heading[1].length;
      headings.splice(level - 1);
      headings[level - 1] = heading[2].trim();
      appendBoundedChunks(
        chunks,
        content,
        line.start,
        line.end,
        "heading",
        headings.filter(Boolean),
      );
      continue;
    }

    if (!line.text.trim()) {
      flushSection();
      continue;
    }
    if (sectionStart < 0) sectionStart = line.start;
    sectionEnd = line.end;
  }
  flushSection();
  return Object.freeze(chunks);
}
