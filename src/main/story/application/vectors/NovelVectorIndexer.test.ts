import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import BookDatabase from "../../storage/book/BookDatabase.ts";
import { novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata from "../../storage/vectors/NovelVectorMetadata.ts";
import NovelVectorIndexer, { NovelVectorIndexQueue } from "./NovelVectorIndexer.ts";

const DIMENSIONS = 64;

function embeddingClient(): AliyunTextEmbeddingClient & { readonly calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "text-embedding-v4",
    dimensions: DIMENSIONS,
    calls,
    embed() {
      throw new Error("embed is not used by the indexer");
    },
    async embedBatch(texts) {
      calls.push([...texts]);
      return {
        data: texts.map((_, index) => ({
          index,
          embedding: Array.from({ length: DIMENSIONS }, () => 0),
        })),
        model: "text-embedding-v4",
        dimensions: DIMENSIONS,
        requestIds: ["test"],
      };
    },
  };
}

describe("novel vector indexer", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "storyos-vector-index-"));
    dirs.push(dir);
    return dir;
  }

  function writeChapter(
    database: BookDatabase,
    bookId: string,
    chapterId: string,
    revisionId: string,
    plainText: string,
  ): void {
    const now = Date.now();
    database.handle
      .prepare(
        `INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at)
         VALUES (?, ?, '第一章', 'draft', 1, ?, ?)`,
      )
      .run(chapterId, bookId, now, now);
    database.handle
      .prepare(
        `INSERT INTO chapter_revisions(
           id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
           character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
         ) VALUES (?, ?, 1, NULL, 'document-hash', 'text-hash', 1, ?, 'editor', 'device', NULL, NULL, '保存', ?)`,
      )
      .run(revisionId, chapterId, plainText.length, now);
    database.handle
      .prepare("INSERT INTO revision_documents(revision_id, document_schema_version, document_json, plain_text) VALUES (?, 1, ?, ?)")
      .run(revisionId, '{"type":"doc"}', plainText);
    database.handle
      .prepare("UPDATE chapters SET current_revision_id = ?, updated_at = ? WHERE id = ?")
      .run(revisionId, now, chapterId);
  }

  async function openIndexer(
    root: string,
    bookPath: string,
    bookId: string,
    sourceGeneration: string,
    embedding: AliyunTextEmbeddingClient,
  ) {
    const spaceId = novelVectorSpaceId(DIMENSIONS);
    const vectorsRoot = path.join(root, "vectors");
    const spacePath = path.join(vectorsRoot, spaceId);
    const book = new Database(bookPath, { readonly: true, fileMustExist: true });
    const metadata = NovelVectorMetadata.open(vectorsRoot);
    const vectors = await LanceNovelVectorStore.open(spacePath, spaceId, DIMENSIONS);
    const reset = async () => {
      rmSync(vectorsRoot, { recursive: true, force: true });
      return {
        metadata: NovelVectorMetadata.open(vectorsRoot),
        vectors: await LanceNovelVectorStore.open(spacePath, spaceId, DIMENSIONS),
      };
    };
    return {
      book,
      indexer: NovelVectorIndexer.create(
        { book, metadata, vectors },
        { bookId, sourceGeneration, embedding },
        reset,
      ),
    };
  }

  it("embeds a saved chapter once and skips the same revision", async () => {
    const root = tempDir();
    const bookId = `book_${randomUUID()}`;
    const bookPath = path.join(root, "book.sqlite");
    const writable = new BookDatabase(bookPath);
    const now = Date.now();
    writable.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    writeChapter(writable, bookId, "chapter-1", "revision-1", "已经写好的正文");
    writable.close();

    const embedding = embeddingClient();
    const opened = await openIndexer(root, bookPath, bookId, "generation-1", embedding);
    try {
      await opened.indexer.index();
    } finally {
      opened.indexer.close();
      opened.book.close();
    }
    const metadata = NovelVectorMetadata.open(path.join(root, "vectors"));
    try {
      expect(embedding.calls).toEqual([["已经写好的正文"]]);
      expect(metadata.listPublications()).toEqual([
        expect.objectContaining({
          chapterId: "chapter-1",
          revisionId: "revision-1",
          textHash: "text-hash",
          chunkCount: 1,
        }),
      ]);
      expect(metadata.getIndexMeta()?.state).toBe("published");
    } finally {
      metadata.close();
    }

    const titled = new BookDatabase(bookPath);
    titled.handle.prepare("UPDATE chapters SET title = '改标题', updated_at = ? WHERE id = ?").run(Date.now(), "chapter-1");
    titled.handle.prepare("UPDATE books SET title = '新书名', updated_at = ? WHERE id = ?").run(Date.now(), bookId);
    titled.close();

    const again = await openIndexer(root, bookPath, bookId, "generation-1", embedding);
    try {
      await again.indexer.index();
      expect(embedding.calls).toEqual([["已经写好的正文"]]);
    } finally {
      again.indexer.close();
      again.book.close();
    }
  }, 20_000);

  it("drops a tombstone immediately and keeps the previous publication when embedding fails", async () => {
    const root = tempDir();
    const bookId = `book_${randomUUID()}`;
    const bookPath = path.join(root, "book.sqlite");
    const writable = new BookDatabase(bookPath);
    const now = Date.now();
    writable.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    writeChapter(writable, bookId, "chapter-1", "revision-1", "第一版");
    writable.close();

    const embedding = embeddingClient();
    const opened = await openIndexer(root, bookPath, bookId, "generation-1", embedding);
    try {
      await opened.indexer.index();
    } finally {
      opened.indexer.close();
      opened.book.close();
    }

    const failedEmbedding: AliyunTextEmbeddingClient & { calls: string[][] } = {
      ...embeddingClient(),
      async embedBatch(texts) {
        this.calls.push([...texts]);
        return { data: [], model: "text-embedding-v4", dimensions: DIMENSIONS, requestIds: ["test"] };
      },
    };
    const revised = new BookDatabase(bookPath);
    const revisedAt = Date.now();
    revised.handle
      .prepare(
        `INSERT INTO chapter_revisions(
           id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
           character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
         ) VALUES ('revision-2', 'chapter-1', 2, 'revision-1', 'document-hash-2', 'text-hash-2', 1, 3, 'editor', 'device', NULL, NULL, '保存', ?)`,
      )
      .run(revisedAt);
    revised.handle
      .prepare("INSERT INTO revision_documents(revision_id, document_schema_version, document_json, plain_text) VALUES ('revision-2', 1, ?, ?)")
      .run('{"type":"doc"}', "第二版");
    revised.handle
      .prepare("UPDATE chapters SET current_revision_id = 'revision-2', updated_at = ? WHERE id = 'chapter-1'")
      .run(revisedAt);
    revised.close();

    const failed = await openIndexer(root, bookPath, bookId, "generation-1", failedEmbedding);
    await expect(failed.indexer.index()).rejects.toThrow(/expected 1/);
    failed.indexer.close();
    failed.book.close();
    const metadata = NovelVectorMetadata.open(path.join(root, "vectors"));
    try {
      expect(metadata.listPublications()[0]).toMatchObject({
        revisionId: "revision-1",
        textHash: "text-hash",
      });
      expect(metadata.getIndexMeta()).toMatchObject({ state: "failed", lastSequence: expect.any(Number) });
      const cursor = metadata.getIndexMeta()?.lastSequence;
      expect(cursor).toBeGreaterThan(0);
    } finally {
      metadata.close();
    }

    const tombstone = new BookDatabase(bookPath);
    tombstone.handle.prepare("UPDATE chapters SET deleted_at = ?, updated_at = ? WHERE id = 'chapter-1'").run(Date.now(), Date.now());
    tombstone.close();
    const removed = await openIndexer(root, bookPath, bookId, "generation-1", embedding);
    try {
      await removed.indexer.index();
    } finally {
      removed.indexer.close();
      removed.book.close();
    }
    const after = NovelVectorMetadata.open(path.join(root, "vectors"));
    try {
      expect(after.listPublications()).toEqual([]);
      expect(after.listChapterChunks("chapter-1")).toEqual([]);
    } finally {
      after.close();
    }
    const vectors = await LanceNovelVectorStore.open(
      path.join(root, "vectors", novelVectorSpaceId(DIMENSIONS)),
      novelVectorSpaceId(DIMENSIONS),
      DIMENSIONS,
    );
    try {
      expect(await vectors.countRevision("chapter-1", "revision-1")).toBe(0);
    } finally {
      vectors.close();
    }
  }, 20_000);

  it("rebuilds from sequence 0 when the source generation changes", async () => {
    const root = tempDir();
    const bookId = `book_${randomUUID()}`;
    const bookPath = path.join(root, "book.sqlite");
    const writable = new BookDatabase(bookPath);
    const now = Date.now();
    writable.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    writeChapter(writable, bookId, "chapter-1", "revision-1", "重建正文");
    writable.close();

    const embedding = embeddingClient();
    const opened = await openIndexer(root, bookPath, bookId, "generation-1", embedding);
    try {
      await opened.indexer.index();
    } finally {
      opened.indexer.close();
      opened.book.close();
    }

    const previousSpace = path.join(root, "vectors", "previous-space");
    writeFileSync(previousSpace, "old");
    const rebuilt = await openIndexer(root, bookPath, bookId, "generation-2", embedding);
    try {
      await rebuilt.indexer.index();
      expect(embedding.calls).toEqual([["重建正文"], ["重建正文"]]);
      expect(existsSync(previousSpace)).toBe(false);
      const metadata = NovelVectorMetadata.open(path.join(root, "vectors"));
      try {
        expect(metadata.getIndexMeta()).toMatchObject({
          sourceGeneration: "generation-2",
          state: "published",
        });
      } finally {
        metadata.close();
      }
    } finally {
      rebuilt.indexer.close();
      rebuilt.book.close();
    }
  }, 20_000);
});

describe("novel vector index queue", () => {
  it("runs one book serially and keeps going after a failure", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new NovelVectorIndexQueue(async (bookId) => {
      order.push(`start:${bookId}`);
      if (bookId === "book-a" && order.filter((item) => item === "start:book-a").length === 1) {
        await gate;
        throw new Error("index failed");
      }
      order.push(`end:${bookId}`);
    });

    queue.enqueue("book-a");
    queue.enqueue("book-a");
    queue.enqueue("book-b");
    await Promise.resolve();
    expect(order).toEqual(["start:book-a", "start:book-b", "end:book-b"]);
    if (!releaseFirst) throw new Error("Missing queue release.");
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["start:book-a", "start:book-b", "end:book-b", "start:book-a", "end:book-a"]);
  });
});
