import { createHash } from "node:crypto";

export const NOVEL_CHUNK_CHARACTER_BUDGET = 800;
export const NOVEL_CHUNKER_VERSION = 1;

export type NovelTextChunk = {
  readonly ordinal: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly content: string;
  readonly contentHash: string;
};

export type NovelVectorIdentity = {
  readonly bookId: string;
  readonly revisionId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly contentHash: string;
  readonly spaceId: string;
};

export function chunkNovelText(plainText: string): readonly NovelTextChunk[] {
  const paragraphs = findParagraphs(plainText);
  const chunks: NovelTextChunk[] = [];
  let groupStart: number | null = null;
  let groupEnd: number | null = null;

  const flush = () => {
    if (groupStart === null || groupEnd === null) return;
    chunks.push(toChunk(plainText, chunks.length, groupStart, groupEnd));
    groupStart = null;
    groupEnd = null;
  };

  for (const paragraph of paragraphs) {
    const length = paragraph.end - paragraph.start;
    if (length > NOVEL_CHUNK_CHARACTER_BUDGET) {
      flush();
      for (let offset = paragraph.start; offset < paragraph.end; offset += NOVEL_CHUNK_CHARACTER_BUDGET) {
        const end = Math.min(offset + NOVEL_CHUNK_CHARACTER_BUDGET, paragraph.end);
        chunks.push(toChunk(plainText, chunks.length, offset, end));
      }
      continue;
    }
    if (groupStart === null || groupEnd === null) {
      groupStart = paragraph.start;
      groupEnd = paragraph.end;
      continue;
    }
    if (paragraph.end - groupStart > NOVEL_CHUNK_CHARACTER_BUDGET) {
      flush();
      groupStart = paragraph.start;
      groupEnd = paragraph.end;
      continue;
    }
    groupEnd = paragraph.end;
  }
  flush();
  return chunks;
}

export function novelChunkContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function novelVectorId(identity: NovelVectorIdentity): string {
  return createHash("sha256")
    .update(
      [
        identity.bookId,
        identity.revisionId,
        String(identity.startOffset),
        String(identity.endOffset),
        identity.contentHash,
        identity.spaceId,
      ].join("\0"),
    )
    .digest("hex");
}

function findParagraphs(plainText: string): readonly { start: number; end: number }[] {
  const paragraphs: { start: number; end: number }[] = [];
  let lineStart = 0;
  for (let index = 0; index <= plainText.length; index += 1) {
    if (index !== plainText.length && plainText[index] !== "\n") continue;
    if (index > lineStart) paragraphs.push({ start: lineStart, end: index });
    lineStart = index + 1;
  }
  return paragraphs;
}

function toChunk(plainText: string, ordinal: number, startOffset: number, endOffset: number): NovelTextChunk {
  const content = plainText.slice(startOffset, endOffset);
  return {
    ordinal,
    startOffset,
    endOffset,
    content,
    contentHash: novelChunkContentHash(content),
  };
}
