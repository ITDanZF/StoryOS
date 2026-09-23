import { rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import type { BookRecord } from "../books/bookRegistryPorts.ts";
import { getBookVectorPaths, novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata from "../../storage/vectors/NovelVectorMetadata.ts";
import NovelVectorIndexer, { NovelVectorIndexQueue } from "./NovelVectorIndexer.ts";

export type NovelVectorIndexPort = {
  enqueue(bookId: string): void;
  noteEmbeddingSpace(spaceId: string | null): void;
};

export default class NovelVectorIndexCoordinator implements NovelVectorIndexPort {
  private readonly queue: NovelVectorIndexQueue;
  private spaceId: string | null;

  constructor(
    private readonly getEmbeddingClient: () => AliyunTextEmbeddingClient | null,
    private readonly getBook: (bookId: string) => BookRecord | null,
    private readonly listOpenBookIds: () => readonly string[],
  ) {
    this.queue = new NovelVectorIndexQueue((bookId) => this.indexBook(bookId));
    this.spaceId = this.currentSpaceId();
  }

  enqueue(bookId: string): void {
    this.queue.enqueue(bookId);
  }

  noteEmbeddingSpace(spaceId: string | null): void {
    if (spaceId === this.spaceId) return;
    this.spaceId = spaceId;
    if (!spaceId) return;
    for (const bookId of this.listOpenBookIds()) this.enqueue(bookId);
  }

  private currentSpaceId(): string | null {
    const client = this.getEmbeddingClient();
    return client ? novelVectorSpaceId(client.dimensions) : null;
  }

  private async indexBook(bookId: string): Promise<void> {
    const embedding = this.getEmbeddingClient();
    if (!embedding) return;
    const book = this.getBook(bookId);
    if (!book || book.state !== "available") return;
    if (!book.sourceGeneration) {
      throw new Error(`Book source generation is missing: ${bookId}`);
    }
    const spaceId = novelVectorSpaceId(embedding.dimensions);
    const paths = getBookVectorPaths(book.storagePath, spaceId);
    const database = new Database(path.join(book.storagePath, "book.sqlite"), {
      readonly: true,
      fileMustExist: true,
    });
    let metadata: NovelVectorMetadata | null = null;
    let vectors: LanceNovelVectorStore | null = null;
    let indexer: NovelVectorIndexer | null = null;
    try {
      metadata = NovelVectorMetadata.open(paths.vectorsRoot);
      vectors = await LanceNovelVectorStore.open(paths.spacePath, spaceId, embedding.dimensions);
      indexer = NovelVectorIndexer.create(
        { book: database, metadata, vectors },
        { bookId: book.id, sourceGeneration: book.sourceGeneration, embedding },
        async () => {
          rmSync(paths.vectorsRoot, { recursive: true, force: true });
          const nextMetadata = NovelVectorMetadata.open(paths.vectorsRoot);
          const nextVectors = await LanceNovelVectorStore.open(
            paths.spacePath,
            spaceId,
            embedding.dimensions,
          );
          metadata = nextMetadata;
          vectors = nextVectors;
          return { metadata: nextMetadata, vectors: nextVectors };
        },
      );
      await indexer.index();
    } finally {
      if (indexer) indexer.close();
      else {
        metadata?.close();
        vectors?.close();
      }
      database.close();
    }
  }
}
