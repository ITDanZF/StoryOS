import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { AliyunTextEmbeddingClient } from "../../../../agent/embedding/aliyun/types.ts";
import { ALIYUN_TEXT_EMBEDDING_MODEL } from "../../../../../shared/contracts/settings/contracts.ts";
import type { BookRecord } from "../../../application/books/bookRegistryPorts.ts";
import NovelVectorPassageQuery from "../../../application/vectors/NovelVectorPassageQuery.ts";
import BookDatabase from "../../../storage/book/BookDatabase.ts";
import { getBookVectorPaths, novelVectorSpaceId } from "../../../storage/book/BookVectorPaths.ts";
import {
  NOVEL_CHUNKER_VERSION,
  novelChunkContentHash,
  novelVectorId,
} from "../../../storage/vectors/chunkNovelText.ts";
import LanceNovelVectorStore from "../../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata, {
  NOVEL_VECTOR_METRIC,
  type NovelVectorSpaceIdentity,
} from "../../../storage/vectors/NovelVectorMetadata.ts";
import BookToolContext from "./BookToolContext.ts";
import { createNovelPassageTools } from "./searchNovelPassages.ts";

const DIMENSIONS = 64;

describe("novel passage tools", () => {
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

  it("returns located passages and applies chapter scope before the limit", async () => {
    const fixture = await openFixture((text) => {
      if (text === "丙") return axis(2);
      if (text === "乙") return axis(1);
      return axis(0);
    });
    try {
      const search = fixture.tools.find((item) => item.name === "search_novel_passages");
      const similar = fixture.tools.find((item) => item.name === "find_similar_passages");
      const closest = JSON.parse(String(await search?.invoke({ query: "丙", limit: 1 }))) as {
        passages: Array<{ chapterId: string; chapterTitle: string; content: string }>;
      };
      expect(closest.passages).toEqual([
        expect.objectContaining({ chapterId: "chapter-3", chapterTitle: "第三章", content: "丙" }),
      ]);

      const bounded = JSON.parse(
        String(await search?.invoke({ query: "丙", limit: 1, up_to_chapter_id: "chapter-1" })),
      ) as { passages: Array<{ chapterId: string }> };
      expect(bounded.passages.map((passage) => passage.chapterId)).toEqual(["chapter-1"]);

      const excluded = JSON.parse(
        String(await similar?.invoke({ text: "丙", limit: 1, exclude_chapter_id: "chapter-3" })),
      ) as { passages: Array<{ chapterId: string }> };
      expect(excluded.passages.map((passage) => passage.chapterId)).toEqual(["chapter-2"]);

      fixture.book.handle.prepare("UPDATE chapters SET deleted_at = ? WHERE id = 'chapter-1'").run(Date.now());
      const afterDelete = JSON.parse(String(await search?.invoke({ query: "甲", limit: 5 }))) as {
        passages: Array<{ chapterId: string }>;
      };
      expect(afterDelete.passages.map((passage) => passage.chapterId)).not.toContain("chapter-1");

      fixture.book.handle
        .prepare(
          `INSERT INTO chapter_revisions(
             id, chapter_id, revision_number, parent_revision_id, document_hash, text_hash, extractor_version,
             character_count, origin, device_id, source_run_id, restored_from_revision_id, change_summary, created_at
           ) VALUES ('revision-2b', 'chapter-2', 2, 'revision-2', 'document-2b', 'text-2b', 1, 1, 'editor', 'device', NULL, NULL, '再保存', ?)`,
        )
        .run(Date.now());
      fixture.book.handle
        .prepare("UPDATE chapters SET current_revision_id = 'revision-2b' WHERE id = 'chapter-2'")
        .run();
      const afterRevision = JSON.parse(String(await search?.invoke({ query: "乙", limit: 5 }))) as {
        passages: Array<{ chapterId: string }>;
      };
      expect(afterRevision.passages.map((passage) => passage.chapterId)).not.toContain("chapter-2");
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it("reports an unusable index instead of an empty passage list", async () => {
    const root = tempDir();
    const bookId = `book_${randomUUID()}`;
    const query = new NovelVectorPassageQuery(
      () => bookRecord(root, bookId),
      () => client(() => axis(0)),
    );
    const tools = createNovelPassageTools(toolContext(bookId, query));
    const search = tools.find((item) => item.name === "search_novel_passages");

    await expect(search?.invoke({ query: "甲", limit: 1 })).rejects.toThrow(
      "Novel vector index does not exist. Use search_book_chapters for a literal search.",
    );
    expect(existsSync(path.join(root, "vectors"))).toBe(false);

    const fixture = await openFixture(() => axis(0));
    try {
      fixture.metadata.handle.prepare("UPDATE index_meta SET state = 'failed', error_message = 'embed failed'").run();
      await expect(fixture.tools.find((item) => item.name === "search_novel_passages")?.invoke({ query: "甲", limit: 1 })).rejects.toThrow(
        "Novel vector index is unavailable.",
      );
      fixture.metadata.handle.prepare("UPDATE index_meta SET state = 'building', error_message = NULL").run();
      await expect(fixture.tools.find((item) => item.name === "find_similar_passages")?.invoke({ text: "甲", limit: 1 })).rejects.toThrow(
        "Novel vector index is rebuilding.",
      );
    } finally {
      await fixture.close();
    }
  }, 20_000);

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "storyos-passage-tool-"));
    dirs.push(dir);
    return dir;
  }

  async function openFixture(embed: (text: string) => readonly number[]) {
    const root = tempDir();
    const bookId = `book_${randomUUID()}`;
    const book = new BookDatabase(path.join(root, "book.sqlite"));
    const now = Date.now();
    book.handle
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES (?, '书', '', 'writing', ?, ?)",
      )
      .run(bookId, now, now);
    insertChapter(book, bookId, "chapter-1", "revision-1", 1, "第一章", "甲", now);
    insertChapter(book, bookId, "chapter-2", "revision-2", 2, "第二章", "乙", now);
    insertChapter(book, bookId, "chapter-3", "revision-3", 3, "第三章", "丙", now);
    const spaceId = novelVectorSpaceId(DIMENSIONS);
    const paths = getBookVectorPaths(root, spaceId);
    const metadata = NovelVectorMetadata.open(paths.vectorsRoot);
    const identity = spaceIdentity(spaceId);
    publish(metadata, identity, bookId, "chapter-1", "revision-1", "甲", 1);
    publish(metadata, identity, bookId, "chapter-2", "revision-2", "乙", 2);
    publish(metadata, identity, bookId, "chapter-3", "revision-3", "丙", 3);
    const vectors = await LanceNovelVectorStore.open(paths.spacePath, spaceId, DIMENSIONS);
    await vectors.merge([
      lanceRow(bookId, spaceId, "chapter-1", "revision-1", "甲", axis(0)),
      lanceRow(bookId, spaceId, "chapter-2", "revision-2", "乙", nearThird()),
      lanceRow(bookId, spaceId, "chapter-3", "revision-3", "丙", axis(2)),
    ]);
    const passages = new NovelVectorPassageQuery(
      () => bookRecord(root, bookId),
      () => client(embed),
    );
    return {
      book,
      metadata,
      tools: createNovelPassageTools(toolContext(bookId, passages)),
      close: async () => {
        vectors.close();
        metadata.close();
        book.close();
      },
    };
  }
});

function toolContext(bookId: string, passages: NovelVectorPassageQuery): BookToolContext {
  return new BookToolContext(
    "project-1",
    { getProjectBook: () => ({ id: bookId }) } as never,
    undefined,
    passages,
  );
}

function bookRecord(root: string, id: string): BookRecord {
  return {
    id,
    storagePath: root,
    sourceGeneration: "generation-1",
    state: "available",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastOpenedAt: null,
  };
}

function client(embed: (text: string) => readonly number[]): AliyunTextEmbeddingClient {
  return {
    model: ALIYUN_TEXT_EMBEDDING_MODEL,
    dimensions: DIMENSIONS,
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
  vector[index] = 1;
  return vector;
}

function nearThird(): number[] {
  const vector = axis(2);
  vector[1] = 0.1;
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
  title: string,
  plainText: string,
  now: number,
): void {
  book.handle
    .prepare(
      `INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
    )
    .run(chapterId, bookId, title, position, now, now);
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
