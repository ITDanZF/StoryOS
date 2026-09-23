import { existsSync, mkdtempSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import type { BookRecord } from "../books/bookRegistryPorts.ts";
import BookDatabase from "../../storage/book/BookDatabase.ts";
import { novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata from "../../storage/vectors/NovelVectorMetadata.ts";
import NovelVectorIndexCoordinator from "./NovelVectorIndexCoordinator.ts";
import { searchNovelFragments } from "./searchNovelVectors.ts";

const DIMENSIONS = 64;

function client(dimensions: AliyunTextEmbeddingClient["dimensions"] = DIMENSIONS): AliyunTextEmbeddingClient {
  return {
    model: "text-embedding-v4",
    dimensions,
    async embed() {
      return unitVector(dimensions);
    },
    async embedBatch(texts) {
      return {
        data: texts.map((_, index) => ({
          index,
          embedding: unitVector(dimensions),
        })),
        model: "text-embedding-v4",
        dimensions,
        requestIds: ["test"],
      };
    },
  };
}

function book(root: string, id: string, state: BookRecord["state"] = "available"): BookRecord {
  return {
    id,
    storagePath: root,
    sourceGeneration: "generation-1",
    state,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastOpenedAt: null,
  };
}

describe("novel vector index coordinator", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      const deadline = Date.now() + 2_000;
      let removed = false;
      while (!removed) {
        try {
          rmSync(dir, { recursive: true, force: true });
          removed = true;
        } catch (error) {
          if (Date.now() > deadline) throw error;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    }
  });

  it("does not create a vector directory when embedding is not configured", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "storyos-vector-lifecycle-"));
    dirs.push(root);
    const coordinator = new NovelVectorIndexCoordinator(
      () => null,
      () => book(root, "book-1"),
      () => [],
    );

    coordinator.enqueue("book-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(existsSync(path.join(root, "vectors"))).toBe(false);
  });

  it("marks only open books for rebuild when the embedding space changes", async () => {
    const seen: string[] = [];
    let current = client(1024);
    const coordinator = new NovelVectorIndexCoordinator(
      () => current,
      (bookId) => {
        seen.push(bookId);
        return book(path.join(tmpdir(), "unused"), bookId, "missing");
      },
      () => ["book-open"],
    );

    coordinator.noteEmbeddingSpace(novelVectorSpaceId(1024));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([]);

    current = client(768);
    coordinator.noteEmbeddingSpace(novelVectorSpaceId(768));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(["book-open"]);
  });

  it("indexes an available book after it is enqueued", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "storyos-vector-lifecycle-"));
    dirs.push(root);
    const bookId = `book_${randomUUID()}`;
    const database = new BookDatabase(path.join(root, "book.sqlite"));
    const now = Date.now();
    database.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    database.handle
      .prepare(
        `INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at)
         VALUES ('chapter-1', ?, '第一章', 'draft', 1, ?, ?)`,
      )
      .run(bookId, now, now);
    database.handle
      .prepare(
        `INSERT INTO chapter_revisions(
           id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
           character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
         ) VALUES ('revision-1', 'chapter-1', 1, NULL, 'document-hash', 'text-hash', 1, 2, 'editor', 'device', NULL, NULL, '保存', ?)`,
      )
      .run(now);
    database.handle
      .prepare(
        "INSERT INTO revision_documents(revision_id, document_schema_version, document_json, plain_text) VALUES ('revision-1', 1, ?, ?)",
      )
      .run('{"type":"doc"}', "正文");
    database.handle
      .prepare("UPDATE chapters SET current_revision_id = 'revision-1', updated_at = ? WHERE id = 'chapter-1'")
      .run(now);
    database.close();

    const coordinator = new NovelVectorIndexCoordinator(
      () => client(),
      () => book(root, bookId),
      () => [],
    );
    coordinator.enqueue(bookId);
    const deadline = Date.now() + 10_000;
    let publications: ReturnType<NovelVectorMetadata["listPublications"]> = [];
    while (publications.length === 0) {
      if (Date.now() > deadline) {
        throw new Error("Novel vector index did not publish the chapter.");
      }
      if (existsSync(path.join(root, "vectors", "metadata.sqlite"))) {
        const metadata = NovelVectorMetadata.open(path.join(root, "vectors"));
        try {
          publications = metadata.listPublications();
          if (metadata.getIndexMeta()?.state === "failed") {
            throw new Error(metadata.getIndexMeta()?.errorMessage ?? "Novel vector index failed.");
          }
        } finally {
          metadata.close();
        }
      }
      if (publications.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(publications).toEqual([
      expect.objectContaining({ chapterId: "chapter-1", revisionId: "revision-1", chunkCount: 1 }),
    ]);
  }, 20_000);

  it("rebuilds into the new embedding directory and queries do not read the old one", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "storyos-vector-lifecycle-"));
    dirs.push(root);
    const bookId = `book_${randomUUID()}`;
    const database = new BookDatabase(path.join(root, "book.sqlite"));
    const now = Date.now();
    database.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    database.handle
      .prepare(
        `INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at)
         VALUES ('chapter-1', ?, '第一章', 'draft', 1, ?, ?)`,
      )
      .run(bookId, now, now);
    database.handle
      .prepare(
        `INSERT INTO chapter_revisions(
           id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
           character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
         ) VALUES ('revision-1', 'chapter-1', 1, NULL, 'document-hash', 'text-hash', 1, 2, 'editor', 'device', NULL, NULL, '保存', ?)`,
      )
      .run(now);
    database.handle
      .prepare(
        "INSERT INTO revision_documents(revision_id, document_schema_version, document_json, plain_text) VALUES ('revision-1', 1, ?, ?)",
      )
      .run('{"type":"doc"}', "正文");
    database.handle
      .prepare("UPDATE chapters SET current_revision_id = 'revision-1', updated_at = ? WHERE id = 'chapter-1'")
      .run(now);
    database.close();

    const openBookIds: string[] = [];
    let current = client(1024);
    const coordinator = new NovelVectorIndexCoordinator(
      () => current,
      () => book(root, bookId),
      () => openBookIds,
    );
    coordinator.enqueue(bookId);
    await waitForPublishedSpace(root, novelVectorSpaceId(1024));

    openBookIds.push(bookId);
    current = client(768);
    coordinator.noteEmbeddingSpace(novelVectorSpaceId(768));
    await waitForPublishedSpace(root, novelVectorSpaceId(768));

    const oldSpace = path.join(root, "vectors", novelVectorSpaceId(1024));
    const newSpace = path.join(root, "vectors", novelVectorSpaceId(768));
    expect(existsSync(oldSpace)).toBe(false);
    expect(existsSync(newSpace)).toBe(true);

    const bookDatabase = new Database(path.join(root, "book.sqlite"), { readonly: true, fileMustExist: true });
    const metadata = NovelVectorMetadata.open(path.join(root, "vectors"));
    const vectors = await LanceNovelVectorStore.open(newSpace, novelVectorSpaceId(768), 768);
    try {
      const hits = await searchNovelFragments(
        {
          book: bookDatabase,
          metadata,
          vectors,
          embedding: current,
          bookId,
          sourceGeneration: "generation-1",
        },
        "正文",
        5,
      );
      expect(hits).toEqual([
        expect.objectContaining({
          bookId,
          chapterId: "chapter-1",
          revisionId: "revision-1",
          content: "正文",
        }),
      ]);
    } finally {
      vectors.close();
      metadata.close();
      bookDatabase.close();
    }
  }, 30_000);
});

function unitVector(dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  vector[0] = 1;
  return vector;
}

async function waitForPublishedSpace(root: string, spaceId: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let failure: string | null = null;
  while (Date.now() <= deadline) {
    if (existsSync(path.join(root, "vectors", "metadata.sqlite"))) {
      const metadata = NovelVectorMetadata.open(path.join(root, "vectors"));
      try {
        const meta = metadata.getIndexMeta();
        if (meta?.state === "failed") failure = meta.errorMessage ?? "Novel vector index failed.";
        if (meta?.state === "published" && meta.spaceId === spaceId && metadata.listPublications().length > 0) {
          return;
        }
      } finally {
        metadata.close();
      }
    }
    if (failure) throw new Error(failure);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Novel vector index did not publish space ${spaceId}.`);
}
