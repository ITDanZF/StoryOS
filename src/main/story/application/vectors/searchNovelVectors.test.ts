import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import { ALIYUN_TEXT_EMBEDDING_MODEL } from "../../../../shared/contracts/settings/contracts.ts";
import BookDatabase from "../../storage/book/BookDatabase.ts";
import { getBookVectorPaths, novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import { NOVEL_CHUNKER_VERSION, novelChunkContentHash, novelVectorId } from "../../storage/vectors/chunkNovelText.ts";
import LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata, {
  NOVEL_VECTOR_METRIC,
  type NovelVectorSpaceIdentity,
} from "../../storage/vectors/NovelVectorMetadata.ts";
import {
  NovelVectorQueryError,
  searchNovelFragments,
  searchSimilarFragments,
  type NovelVectorQueryDependencies,
} from "./searchNovelVectors.ts";

const DIMENSIONS = 64;

describe("novel vector query", () => {
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

  it("returns the current published fragment and drops deleted or stale chapters", async () => {
    const embedded: string[] = [];
    const fixture = await openFixture((text) => {
      embedded.push(text);
      return axis(text === "第二章" ? 1 : 0);
    });
    try {
      const first = await searchNovelFragments(fixture.dependencies, "第一章", 2);
      expect(first).toEqual([
        {
          bookId: fixture.bookId,
          chapterId: "chapter-1",
          revisionId: "revision-1",
          startOffset: 0,
          endOffset: "第一章正文".length,
          content: "第一章正文",
          contentHash: novelChunkContentHash("第一章正文"),
        },
        {
          bookId: fixture.bookId,
          chapterId: "chapter-2",
          revisionId: "revision-2",
          startOffset: 0,
          endOffset: "第二章正文".length,
          content: "第二章正文",
          contentHash: novelChunkContentHash("第二章正文"),
        },
      ]);

      fixture.book.handle.prepare("UPDATE chapters SET deleted_at = ? WHERE id = 'chapter-1'").run(Date.now());
      const afterDelete = await searchNovelFragments(fixture.dependencies, "第一章", 2);
      expect(afterDelete.map((hit) => hit.chapterId)).toEqual(["chapter-2"]);

      fixture.book.handle
        .prepare(
          `INSERT INTO chapter_revisions(
             id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
             character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
           ) VALUES ('revision-2b', 'chapter-2', 2, 'revision-2', 'document-hash-2b', 'text-hash-2b', 1, 2, 'editor', 'device', NULL, NULL, '再保存', ?)`,
        )
        .run(Date.now());
      fixture.book.handle
        .prepare("UPDATE chapters SET current_revision_id = 'revision-2b' WHERE id = 'chapter-2'")
        .run();
      const afterRevision = await searchSimilarFragments(fixture.dependencies, "第二章", 2);
      expect(afterRevision).toEqual([]);
      expect(embedded).toEqual(["第一章", "第一章", "第二章"]);
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it("rejects a missing, failed, rebuilding, or superseded index before searching", async () => {
    const embedded: string[] = [];
    const fixture = await openFixture(() => {
      embedded.push("called");
      return axis(0);
    });
    const searches: string[] = [];
    const originalSearch = fixture.vectors.search.bind(fixture.vectors);
    fixture.vectors.search = async (request) => {
      searches.push(request.bookId);
      return originalSearch(request);
    };
    try {
      fixture.metadata.handle.prepare("DELETE FROM index_meta").run();
      await expect(searchNovelFragments(fixture.dependencies, "第一章", 1)).rejects.toThrow(
        "Novel vector index does not exist.",
      );

      fixture.metadata.handle
        .prepare(
          `INSERT INTO index_meta(
             singleton, source_generation, last_sequence, space_id, model_name, dimensions, metric,
             chunker_version, state, error_message, updated_at
           ) VALUES (1, 'generation-1', 2, ?, ?, 64, 'cosine', 1, 'failed', 'embed failed', 1)`,
        )
        .run(novelVectorSpaceId(DIMENSIONS), ALIYUN_TEXT_EMBEDDING_MODEL);
      await expect(searchNovelFragments(fixture.dependencies, "第一章", 1)).rejects.toThrow(
        "Novel vector index is unavailable.",
      );

      fixture.metadata.handle.prepare("UPDATE index_meta SET state = 'building', error_message = NULL").run();
      await expect(searchNovelFragments(fixture.dependencies, "第一章", 1)).rejects.toThrow(
        "Novel vector index is rebuilding.",
      );

      fixture.metadata.handle.prepare("UPDATE index_meta SET state = 'published'").run();
      fixture.metadata.handle.prepare("UPDATE index_meta SET chunker_version = 2").run();
      await expect(searchNovelFragments(fixture.dependencies, "第一章", 1)).rejects.toThrow(
        "Novel vector index is rebuilding.",
      );

      fixture.metadata.handle.prepare("UPDATE index_meta SET chunker_version = 1").run();
      fixture.metadata.handle.prepare("UPDATE index_meta SET source_generation = 'generation-2'").run();
      await expect(searchNovelFragments(fixture.dependencies, "第一章", 1)).rejects.toThrow(
        "Novel vector index is rebuilding.",
      );
      fixture.metadata.handle.prepare("UPDATE index_meta SET source_generation = 'generation-1'").run();
      const superseded = {
        ...fixture.dependencies,
        embedding: client(768, () => axis(0)),
      };
      await expect(searchNovelFragments(superseded, "第一章", 1)).rejects.toThrow(
        "Novel vector index is rebuilding.",
      );
      expect(await fixture.vectors.countRevision("chapter-1", "revision-1")).toBe(1);
      expect(searches).toEqual([]);
      expect(embedded).toEqual([]);

      await expect(searchNovelFragments(fixture.dependencies, "  ", 1)).rejects.toBeInstanceOf(
        NovelVectorQueryError,
      );
      await expect(searchNovelFragments(fixture.dependencies, "第一章", 0)).rejects.toBeInstanceOf(
        NovelVectorQueryError,
      );
    } finally {
      await fixture.close();
    }
  }, 20_000);

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "storyos-vector-query-"));
    dirs.push(dir);
    return dir;
  }

  async function openFixture(embed: (text: string) => readonly number[]): Promise<{
    bookId: string;
    book: BookDatabase;
    metadata: NovelVectorMetadata;
    vectors: LanceNovelVectorStore;
    dependencies: NovelVectorQueryDependencies;
    close: () => Promise<void>;
  }> {
    const root = tempDir();
    const bookId = `book_${randomUUID()}`;
    const book = new BookDatabase(path.join(root, "book.sqlite"));
    const now = Date.now();
    book.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    insertChapter(book, bookId, "chapter-1", "revision-1", 1, "第一章正文", now);
    insertChapter(book, bookId, "chapter-2", "revision-2", 2, "第二章正文", now);

    const spaceId = novelVectorSpaceId(DIMENSIONS);
    const paths = getBookVectorPaths(root, spaceId);
    const metadata = NovelVectorMetadata.open(paths.vectorsRoot);
    const identity = spaceIdentity(spaceId);
    publish(metadata, identity, bookId, "chapter-1", "revision-1", "第一章正文", 1);
    publish(metadata, identity, bookId, "chapter-2", "revision-2", "第二章正文", 2);
    const vectors = await LanceNovelVectorStore.open(paths.spacePath, spaceId, DIMENSIONS);
    await vectors.merge([
      lanceRow(bookId, spaceId, "chapter-1", "revision-1", "第一章正文", axis(0)),
      lanceRow(bookId, spaceId, "chapter-2", "revision-2", "第二章正文", axis(1)),
    ]);
    return {
      bookId,
      book,
      metadata,
      vectors,
      dependencies: {
        book: book.handle,
        metadata,
        vectors,
        embedding: client(DIMENSIONS, embed),
        bookId,
        sourceGeneration: "generation-1",
      },
      close: async () => {
        vectors.close();
        metadata.close();
        book.close();
      },
    };
  }
});

function client(
  dimensions: AliyunTextEmbeddingClient["dimensions"],
  embed: (text: string) => readonly number[],
): AliyunTextEmbeddingClient {
  return {
    model: ALIYUN_TEXT_EMBEDDING_MODEL,
    dimensions,
    async embed(text: string) {
      return embed(text);
    },
    embedBatch() {
      throw new Error("embedBatch is not used");
    },
  };
}

function axis(index: number): number[] {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  const component = vector[index];
  if (component === undefined) throw new Error(`Axis ${index} is outside the test vector.`);
  vector[index] = 1;
  return vector;
}

function spaceIdentity(spaceId: string): NovelVectorSpaceIdentity {
  return {
    sourceGeneration: "generation-1",
    spaceId,
    modelName: ALIYUN_TEXT_EMBEDDING_MODEL,
    dimensions: DIMENSIONS,
    metric: NOVEL_VECTOR_METRIC,
    chunkerVersion: NOVEL_CHUNKER_VERSION,
  };
}

function publish(
  metadata: NovelVectorMetadata,
  identity: NovelVectorSpaceIdentity,
  bookId: string,
  chapterId: string,
  revisionId: string,
  content: string,
  lastSequence: number,
): void {
  const contentHash = novelChunkContentHash(content);
  metadata.publishChapter(identity, {
    lastSequence,
    chapterId,
    revisionId,
    textHash: `text-${chapterId}`,
    publishedAt: 1,
    chunks: [
      {
        id: novelVectorId({
          bookId,
          revisionId,
          startOffset: 0,
          endOffset: content.length,
          contentHash,
          spaceId: identity.spaceId,
        }),
        chapterId,
        revisionId,
        ordinal: 0,
        startOffset: 0,
        endOffset: content.length,
        contentHash,
        content,
      },
    ],
  });
}

function lanceRow(
  bookId: string,
  spaceId: string,
  chapterId: string,
  revisionId: string,
  content: string,
  vector: readonly number[],
) {
  const contentHash = novelChunkContentHash(content);
  return {
    vectorId: novelVectorId({
      bookId,
      revisionId,
      startOffset: 0,
      endOffset: content.length,
      contentHash,
      spaceId,
    }),
    bookId,
    chapterId,
    revisionId,
    startOffset: 0,
    endOffset: content.length,
    textHash: `text-${chapterId}`,
    contentHash,
    spaceId,
    vector,
  };
}

function insertChapter(
  book: BookDatabase,
  bookId: string,
  chapterId: string,
  revisionId: string,
  position: number,
  plainText: string,
  now: number,
): void {
  book.handle
    .prepare(
      `INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
    )
    .run(chapterId, bookId, chapterId, position, now, now);
  book.handle
    .prepare(
      `INSERT INTO chapter_revisions(
         id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
         character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
       ) VALUES (?, ?, 1, NULL, ?, ?, 1, ?, 'editor', 'device', NULL, NULL, '保存', ?)`,
    )
    .run(revisionId, chapterId, `document-${revisionId}`, `text-${chapterId}`, plainText.length, now);
  book.handle
    .prepare(
      "INSERT INTO revision_documents(revision_id, document_schema_version, document_json, plain_text) VALUES (?, 1, ?, ?)",
    )
    .run(revisionId, '{"type":"doc"}', plainText);
  book.handle
    .prepare("UPDATE chapters SET current_revision_id = ?, updated_at = ? WHERE id = ?")
    .run(revisionId, now, chapterId);
}
