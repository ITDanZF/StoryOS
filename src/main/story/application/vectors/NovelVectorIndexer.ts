import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import { novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import {
  NOVEL_CHUNKER_VERSION,
  chunkNovelText,
  novelVectorId,
  type NovelTextChunk,
} from "../../storage/vectors/chunkNovelText.ts";
import type LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata, {
  NOVEL_VECTOR_METRIC,
  type NovelVectorSpaceIdentity,
} from "../../storage/vectors/NovelVectorMetadata.ts";

export type NovelVectorIndexStores = {
  book: BetterSqliteDatabase;
  metadata: NovelVectorMetadata;
  vectors: LanceNovelVectorStore;
};

export type NovelVectorIndexRequest = {
  readonly bookId: string;
  readonly sourceGeneration: string;
  readonly embedding: AliyunTextEmbeddingClient;
};

type ChapterChange = {
  readonly sequence: number;
  readonly chapterId: string;
};

type CurrentChapter = {
  readonly bookId: string;
  readonly deletedAt: number | null;
  readonly revisionId: string | null;
  readonly textHash: string | null;
  readonly plainText: string | null;
};

export default class NovelVectorIndexer {
  private constructor(
    private stores: NovelVectorIndexStores,
    private readonly identity: NovelVectorSpaceIdentity,
    private readonly request: NovelVectorIndexRequest,
    private readonly reset: () => Promise<Pick<NovelVectorIndexStores, "metadata" | "vectors">>,
  ) {}

  static create(
    stores: NovelVectorIndexStores,
    request: NovelVectorIndexRequest,
    reset: () => Promise<Pick<NovelVectorIndexStores, "metadata" | "vectors">>,
  ): NovelVectorIndexer {
    if (request.bookId.trim() === "") throw new Error("Book id is required.");
    if (request.sourceGeneration.trim() === "") throw new Error("Source generation is required.");
    const identity: NovelVectorSpaceIdentity = {
      sourceGeneration: request.sourceGeneration,
      spaceId: novelVectorSpaceId(request.embedding.dimensions),
      modelName: request.embedding.model,
      dimensions: request.embedding.dimensions,
      metric: NOVEL_VECTOR_METRIC,
      chunkerVersion: NOVEL_CHUNKER_VERSION,
    };
    return new NovelVectorIndexer(stores, identity, request, reset);
  }

  close(): void {
    this.stores.metadata.close();
    this.stores.vectors.close();
  }

  async index(): Promise<void> {
    await this.rebuildIfNeeded();
    const cursor = this.stores.metadata.getIndexMeta()?.lastSequence ?? 0;
    const changes = this.readChapterChanges(cursor);
    try {
      for (const change of changes) {
        await this.applyChange(change);
      }
      await this.removeStaleVectors();
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  private async rebuildIfNeeded(): Promise<void> {
    const meta = this.stores.metadata.getIndexMeta();
    if (!meta) return;
    if (
      meta.sourceGeneration === this.identity.sourceGeneration &&
      meta.spaceId === this.identity.spaceId &&
      meta.chunkerVersion === this.identity.chunkerVersion
    ) {
      return;
    }
    this.stores.metadata.close();
    this.stores.vectors.close();
    const reopened = await this.reset();
    this.stores = { ...this.stores, ...reopened };
  }

  private async applyChange(change: ChapterChange): Promise<void> {
    const current = this.readChapter(change.chapterId);
    const now = Date.now();
    const revisionId = current?.revisionId ?? null;
    const textHash = current?.textHash ?? null;
    const plainText = current?.plainText ?? null;
    if (!current || current.deletedAt !== null || revisionId === null || textHash === null || plainText === null) {
      this.stores.metadata.removeChapter(this.identity, {
        chapterId: change.chapterId,
        lastSequence: change.sequence,
        updatedAt: now,
      });
      await this.stores.vectors.deleteChapter(change.chapterId);
      return;
    }
    if (current.bookId !== this.request.bookId) {
      throw new Error(`Chapter ${change.chapterId} does not belong to book ${this.request.bookId}.`);
    }
    const published = this.stores.metadata
      .listPublications()
      .find((publication) => publication.chapterId === change.chapterId);
    if (published?.revisionId === revisionId && published.textHash === textHash) {
      this.stores.metadata.advanceCursor(this.identity, {
        lastSequence: change.sequence,
        updatedAt: now,
      });
      return;
    }
    const chunks = chunkNovelText(plainText);
    const rows =
      chunks.length === 0
        ? []
        : await this.embed(change.chapterId, revisionId, textHash, chunks);
    if (rows.length !== chunks.length) {
      throw new Error(`Embedding batch returned ${rows.length} vectors; expected ${chunks.length}.`);
    }
    if (rows.length > 0) {
      await this.stores.vectors.merge(rows);
      await this.assertStored(change.chapterId, revisionId, rows);
    }
    this.stores.metadata.publishChapter(this.identity, {
      lastSequence: change.sequence,
      chapterId: change.chapterId,
      revisionId,
      textHash,
      publishedAt: now,
      chunks: chunks.map((chunk, index) => {
        const row = rows[index];
        if (!row) {
          throw new Error(`Embedding batch is missing chunk ${index}.`);
        }
        return {
          id: row.vectorId,
          chapterId: change.chapterId,
          revisionId,
          ordinal: chunk.ordinal,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          contentHash: chunk.contentHash,
          content: chunk.content,
        };
      }),
    });
    await this.stores.vectors.deleteChapterExcept(
      change.chapterId,
      rows.map((row) => row.vectorId),
    );
  }

  private async embed(
    chapterId: string,
    revisionId: string,
    textHash: string,
    chunks: readonly NovelTextChunk[],
  ) {
    const response = await this.request.embedding.embedBatch(chunks.map((chunk) => chunk.content));
    if (response.model !== this.request.embedding.model || response.dimensions !== this.request.embedding.dimensions) {
      throw new Error("Embedding response does not match the configured model space.");
    }
    if (response.data.length !== chunks.length) {
      throw new Error(
        `Embedding batch returned ${response.data.length} vectors; expected ${chunks.length}.`,
      );
    }
    const ordered = [...response.data].sort((left, right) => left.index - right.index);
    return chunks.map((chunk, index) => {
      const item = ordered[index];
      if (!item || item.index !== index || item.embedding.length !== this.request.embedding.dimensions) {
        throw new Error("Embedding batch order or dimensions do not match the input chunks.");
      }
      return {
        vectorId: novelVectorId(this.vectorIdentity(chunk, revisionId)),
        bookId: this.request.bookId,
        chapterId,
        revisionId,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        textHash,
        contentHash: chunk.contentHash,
        spaceId: this.identity.spaceId,
        vector: item.embedding,
      };
    });
  }

  private vectorIdentity(chunk: NovelTextChunk, revisionId: string) {
    return {
      bookId: this.request.bookId,
      revisionId,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      contentHash: chunk.contentHash,
      spaceId: this.identity.spaceId,
    };
  }

  private async assertStored(
    chapterId: string,
    revisionId: string,
    rows: readonly { readonly vectorId: string; readonly contentHash: string }[],
  ): Promise<void> {
    const stored = await this.stores.vectors.listRevision(chapterId, revisionId);
    if (stored.length !== rows.length) {
      throw new Error(`Stored novel vectors: ${stored.length}; expected ${rows.length}.`);
    }
    const actual = new Map(stored.map((row) => [row.vectorId, row.contentHash]));
    for (const row of rows) {
      if (actual.get(row.vectorId) !== row.contentHash) {
        throw new Error(`Stored novel vector hash mismatch: ${row.vectorId}`);
      }
    }
  }

  private async removeStaleVectors(): Promise<void> {
    const published = new Map(
      this.stores.metadata.listPublications().map((publication) => {
        const ids = this.stores.metadata.listChapterChunks(publication.chapterId).map((chunk) => chunk.id);
        return [publication.chapterId, ids] as const;
      }),
    );
    const chapterIds = new Set([...published.keys(), ...(await this.stores.vectors.listChapterIds())]);
    for (const chapterId of chapterIds) {
      await this.stores.vectors.deleteChapterExcept(chapterId, published.get(chapterId) ?? []);
    }
  }

  private recordFailure(error: unknown): void {
    const cursor = this.stores.metadata.getIndexMeta()?.lastSequence ?? 0;
    const message = error instanceof Error ? error.message : String(error);
    try {
      this.stores.metadata.markFailed(this.identity, {
        lastSequence: cursor,
        errorMessage: message,
        updatedAt: Date.now(),
      });
    } catch (failure) {
      if (failure instanceof Error && failure.message === "A failed novel vector update cannot move the cursor.") {
        return;
      }
      throw failure;
    }
  }

  private readChapterChanges(after: number): readonly ChapterChange[] {
    const rows = this.stores.book
      .prepare(
        `SELECT local_sequence AS sequence, entity_id AS chapterId
         FROM book_changes
         WHERE entity_type = 'chapters' AND local_sequence > ?
         ORDER BY local_sequence`,
      )
      .all(after) as Array<{ sequence: number; chapterId: string }>;
    return rows;
  }

  private readChapter(chapterId: string): CurrentChapter | null {
    const row = this.stores.book
      .prepare(
        `SELECT c.book_id AS bookId, c.deleted_at AS deletedAt, c.current_revision_id AS revisionId,
                r.text_hash AS textHash, d.plain_text AS plainText
         FROM chapters c
         LEFT JOIN chapter_revisions r ON r.id = c.current_revision_id
         LEFT JOIN revision_documents d ON d.revision_id = c.current_revision_id
         WHERE c.id = ?`,
      )
      .get(chapterId) as CurrentChapter | undefined;
    return row ?? null;
  }
}

export class NovelVectorIndexQueue {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly indexBook: (bookId: string) => Promise<void>) {}

  enqueue(bookId: string): void {
    if (bookId.trim() === "") throw new Error("Book id is required.");
    const previous = this.tails.get(bookId) ?? Promise.resolve();
    const settled = previous.then(
      () => this.indexBook(bookId),
      () => this.indexBook(bookId),
    );
    this.tails.set(
      bookId,
      settled.then(
        () => undefined,
        (error: unknown) => {
          console.error(`Novel vector index failed for ${bookId}.`, error);
        },
      ),
    );
  }
}
