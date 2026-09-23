import { describe, expect, it } from "vitest";
import {
  NOVEL_CHUNK_CHARACTER_BUDGET,
  chunkNovelText,
  novelVectorId,
  type NovelTextChunk,
} from "./chunkNovelText.ts";

function chunkAt(chunks: readonly NovelTextChunk[], index: number): NovelTextChunk {
  const chunk = chunks[index];
  if (!chunk) throw new Error(`Missing chunk ${index}`);
  return chunk;
}

const bookId = "book_11111111-1111-1111-1111-111111111111";
const revisionId = "revision-1";
const spaceId = "text-embedding-v4-1024";

describe("novel text chunker", () => {
  it("returns no chunks for empty text or blank lines", () => {
    expect(chunkNovelText("")).toEqual([]);
    expect(chunkNovelText("\n\n\n")).toEqual([]);
  });

  it("keeps one short paragraph as a single slice", () => {
    const chunks = chunkNovelText("开场");
    expect(chunks).toHaveLength(1);
    const chunk = chunkAt(chunks, 0);
    expect(chunk).toMatchObject({ ordinal: 0, startOffset: 0, endOffset: 2, content: "开场" });
    expect("开场".slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
  });

  it("packs adjacent paragraphs until the 800 character budget", () => {
    const first = "甲".repeat(400);
    const second = "乙".repeat(399);
    const text = `${first}\n${second}`;
    const chunks = chunkNovelText(text);

    const chunk = chunkAt(chunks, 0);
    expect(chunks).toHaveLength(1);
    expect(chunk.content).toBe(text);
    expect(chunk.endOffset - chunk.startOffset).toBe(NOVEL_CHUNK_CHARACTER_BUDGET);
    expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
  });

  it("starts a new chunk when the next paragraph would pass 800", () => {
    const text = `${"甲".repeat(400)}\n${"乙".repeat(400)}`;
    const chunks = chunkNovelText(text);

    expect(chunks.map((chunk) => chunk.content)).toEqual(["甲".repeat(400), "乙".repeat(400)]);
    expect(chunkAt(chunks, 0).endOffset).toBe(400);
    expect(chunkAt(chunks, 1).startOffset).toBe(401);
  });

  it("hard-splits a paragraph longer than 800 without overlap", () => {
    const text = "段".repeat(NOVEL_CHUNK_CHARACTER_BUDGET + 1);
    const chunks = chunkNovelText(text);

    expect(chunks.map((chunk) => [chunk.startOffset, chunk.endOffset])).toEqual([
      [0, NOVEL_CHUNK_CHARACTER_BUDGET],
      [NOVEL_CHUNK_CHARACTER_BUDGET, NOVEL_CHUNK_CHARACTER_BUDGET + 1],
    ]);
    const head = chunkAt(chunks, 0);
    const tail = chunkAt(chunks, 1);
    expect(chunks.map((chunk) => chunk.content).join("")).toBe(text);
    expect(text.slice(head.startOffset, head.endOffset)).toBe(head.content);
    expect(text.slice(tail.startOffset, tail.endOffset)).toBe(tail.content);
  });

  it("builds the same vector id from the same chunk identity", () => {
    const chunk = chunkAt(chunkNovelText("同一段"), 0);
    const identity = {
      bookId,
      revisionId,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      contentHash: chunk.contentHash,
      spaceId,
    };

    expect(novelVectorId(identity)).toBe(novelVectorId(identity));
    expect(novelVectorId({ ...identity, endOffset: identity.endOffset + 1 })).not.toBe(
      novelVectorId(identity),
    );
  });
});
