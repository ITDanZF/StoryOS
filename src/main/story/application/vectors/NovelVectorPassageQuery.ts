import { existsSync } from "node:fs";
import path from "node:path";
import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import type { BookRecord } from "../books/bookRegistryPorts.ts";
import { getBookVectorPaths, novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import NovelVectorMetadata, {
  NovelVectorMetadataUnavailableError,
} from "../../storage/vectors/NovelVectorMetadata.ts";
import {
  NovelVectorQueryError,
  searchNovelFragments,
  searchSimilarFragments,
  type NovelVectorSearchScope,
} from "./searchNovelVectors.ts";

export type NovelPassage = {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly revisionId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly content: string;
};

export default class NovelVectorPassageQuery {
  constructor(
    private readonly getBook: (bookId: string) => BookRecord | null,
    private readonly getEmbeddingClient: () => AliyunTextEmbeddingClient | null,
  ) {}

  searchPassages(input: {
    readonly bookId: string;
    readonly query: string;
    readonly limit: number;
    readonly upToChapterId?: string;
  }): Promise<readonly NovelPassage[]> {
    return this.search(input.bookId, input.query, input.limit, {
      ...(input.upToChapterId === undefined ? {} : { upToChapterId: input.upToChapterId }),
    }, searchNovelFragments);
  }

  findSimilarPassages(input: {
    readonly bookId: string;
    readonly text: string;
    readonly limit: number;
    readonly excludeChapterId?: string;
  }): Promise<readonly NovelPassage[]> {
    return this.search(input.bookId, input.text, input.limit, {
      ...(input.excludeChapterId === undefined ? {} : { excludeChapterId: input.excludeChapterId }),
    }, searchSimilarFragments);
  }

  private async search(
    bookId: string,
    text: string,
    limit: number,
    scope: NovelVectorSearchScope,
    search: typeof searchNovelFragments,
  ): Promise<readonly NovelPassage[]> {
    const embedding = this.getEmbeddingClient();
    if (!embedding) throw new NovelVectorQueryError("Novel vector index does not exist.");
    const book = this.getBook(bookId);
    if (!book || book.state !== "available") {
      throw new NovelVectorQueryError("Novel vector index does not exist.");
    }
    if (!book.sourceGeneration) throw new Error(`Book source generation is missing: ${bookId}`);
    const spaceId = novelVectorSpaceId(embedding.dimensions);
    const paths = getBookVectorPaths(book.storagePath, spaceId);
    if (!existsSync(paths.metadataPath) || !existsSync(paths.spacePath)) {
      throw new NovelVectorQueryError("Novel vector index does not exist.");
    }
    const database = new Database(path.join(book.storagePath, "book.sqlite"), {
      readonly: true,
      fileMustExist: true,
    });
    let metadata: NovelVectorMetadata | null = null;
    let vectors: LanceNovelVectorStore | null = null;
    try {
      metadata = NovelVectorMetadata.openExisting(paths.vectorsRoot);
      vectors = await LanceNovelVectorStore.open(paths.spacePath, spaceId, embedding.dimensions);
      const hits = await search(
        {
          book: database,
          metadata,
          vectors,
          embedding,
          bookId,
          sourceGeneration: book.sourceGeneration,
        },
        text,
        limit,
        scope,
      );
      return hits.map((hit) => ({
        chapterId: hit.chapterId,
        chapterTitle: chapterTitle(database, bookId, hit.chapterId),
        revisionId: hit.revisionId,
        startOffset: hit.startOffset,
        endOffset: hit.endOffset,
        content: hit.content,
      }));
    } catch (error) {
      if (error instanceof NovelVectorMetadataUnavailableError) {
        throw new NovelVectorQueryError("Novel vector index is unavailable.");
      }
      throw error;
    } finally {
      vectors?.close();
      metadata?.close();
      database.close();
    }
  }
}

function chapterTitle(book: BetterSqliteDatabase, bookId: string, chapterId: string): string {
  const row = book.prepare("SELECT title FROM chapters WHERE id = ? AND book_id = ?").get(chapterId, bookId) as
    | { title: string }
    | undefined;
  if (!row || row.title.trim() === "") throw new Error(`Chapter title is missing: ${chapterId}`);
  return row.title;
}
