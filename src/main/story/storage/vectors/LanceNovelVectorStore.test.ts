import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LanceDimensionError } from "../lancedb/errors.ts";
import LanceNovelVectorStore, { type NovelLanceVectorRow } from "./LanceNovelVectorStore.ts";

const spaceId = "text-embedding-v4-4";

function row(overrides: Partial<NovelLanceVectorRow> = {}): NovelLanceVectorRow {
  return {
    vectorId: "vector-1",
    bookId: "book-1",
    chapterId: "chapter-1",
    revisionId: "revision-1",
    startOffset: 0,
    endOffset: 2,
    textHash: "text-hash",
    contentHash: "content-hash",
    spaceId,
    vector: [1, 0, 0, 0],
    ...overrides,
  };
}

describe("Lance novel vector store", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "storyos-lance-novel-"));
    dirs.push(dir);
    return dir;
  }

  it("merges the same vector id and filters exact search to published revisions", async () => {
    const store = await LanceNovelVectorStore.open(tempDir(), spaceId, 4);
    try {
      await store.merge([row(), row({ vectorId: "vector-2", revisionId: "revision-2", vector: [0, 1, 0, 0] })]);
      await store.merge([row({ contentHash: "updated-hash" })]);

      expect(await store.countRevision("chapter-1", "revision-1")).toBe(1);
      const hits = await store.search({
        bookId: "book-1",
        vector: [1, 0, 0, 0],
        publications: [{ chapterId: "chapter-1", revisionId: "revision-1" }],
        limit: 5,
      });
      expect(hits.map((hit) => hit.vectorId)).toEqual(["vector-1"]);
      expect(hits[0]?.contentHash).toBe("updated-hash");

      await store.deleteChapterExcept("chapter-1", ["vector-2"]);
      expect(await store.countRevision("chapter-1", "revision-1")).toBe(0);
      expect(await store.countRevision("chapter-1", "revision-2")).toBe(1);
    } finally {
      store.close();
    }
  }, 20_000);

  it("rejects a vector whose dimensions do not match the table", async () => {
    const directory = tempDir();
    const store = await LanceNovelVectorStore.open(directory, spaceId, 4);
    store.close();

    await expect(LanceNovelVectorStore.open(directory, spaceId, 8)).rejects.toBeInstanceOf(
      LanceDimensionError,
    );
    const reopened = await LanceNovelVectorStore.open(directory, spaceId, 4);
    try {
      await expect(reopened.merge([row({ vector: [1, 0, 0] })])).rejects.toBeInstanceOf(LanceDimensionError);
    } finally {
      reopened.close();
    }
  }, 20_000);
});
