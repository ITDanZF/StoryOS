import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { AliyunTextEmbeddingClient } from "../../../agent/embedding/aliyun/types.ts";
import { novelVectorSpaceId } from "../../storage/book/BookVectorPaths.ts";
import { NOVEL_CHUNKER_VERSION } from "../../storage/vectors/chunkNovelText.ts";
import type LanceNovelVectorStore from "../../storage/vectors/LanceNovelVectorStore.ts";
import type NovelVectorMetadata from "../../storage/vectors/NovelVectorMetadata.ts";
import type { NovelVectorIndexMeta } from "../../storage/vectors/NovelVectorMetadata.ts";

export type NovelVectorHit = {
  readonly bookId: string;
  readonly chapterId: string;
  readonly revisionId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly content: string;
  readonly contentHash: string;
};

export type NovelVectorQueryDependencies = {
  readonly book: BetterSqliteDatabase;
  readonly metadata: NovelVectorMetadata;
  readonly vectors: LanceNovelVectorStore;
  readonly embedding: AliyunTextEmbeddingClient;
  readonly bookId: string;
  readonly sourceGeneration: string;
};

export class NovelVectorQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NovelVectorQueryError";
  }
}

export type NovelVectorSearchScope = {
  readonly upToChapterId?: string;
  readonly excludeChapterId?: string;
};

export function searchNovelFragments(
  dependencies: NovelVectorQueryDependencies,
  queryText: string,
  limit: number,
  scope?: NovelVectorSearchScope,
): Promise<readonly NovelVectorHit[]> {
  return searchNovelVectors(dependencies, queryText, limit, scope);
}

export function searchSimilarFragments(
  dependencies: NovelVectorQueryDependencies,
  sourceText: string,
  limit: number,
  scope?: NovelVectorSearchScope,
): Promise<readonly NovelVectorHit[]> {
  return searchNovelVectors(dependencies, sourceText, limit, scope);
}

async function searchNovelVectors(
  dependencies: NovelVectorQueryDependencies,
  text: string,
  limit: number,
  scope?: NovelVectorSearchScope,
): Promise<readonly NovelVectorHit[]> {
  if (dependencies.bookId.trim() === "") throw new NovelVectorQueryError("Book id is required.");
  if (dependencies.sourceGeneration.trim() === "") {
    throw new NovelVectorQueryError("Source generation is required.");
  }
  if (text.trim() === "") throw new NovelVectorQueryError("Novel vector query text is required.");
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new NovelVectorQueryError("Novel vector search limit must be a positive integer.");
  }
  const spaceId = novelVectorSpaceId(dependencies.embedding.dimensions);
  requirePublishedIndex(dependencies.metadata.getIndexMeta(), {
    sourceGeneration: dependencies.sourceGeneration,
    spaceId,
  });
  const allowedChapterIds = resolveSearchScope(dependencies.book, dependencies.bookId, scope);
  const vector = await dependencies.embedding.embed(text);
  if (vector.length !== dependencies.embedding.dimensions) {
    throw new NovelVectorQueryError(
      `Query vector has ${vector.length} dimensions; expected ${dependencies.embedding.dimensions}.`,
    );
  }
  const publications = dependencies.metadata
    .listPublications()
    .filter((publication) => allowedChapterIds?.has(publication.chapterId) ?? true)
    .map((publication) => ({
      chapterId: publication.chapterId,
      revisionId: publication.revisionId,
    }));
  const matches = await dependencies.vectors.search({
    bookId: dependencies.bookId,
    vector,
    publications,
    limit,
  });
  const hits: NovelVectorHit[] = [];
  for (const match of matches) {
    if (match.bookId !== dependencies.bookId || match.spaceId !== spaceId) continue;
    if (!isCurrentRevision(dependencies.book, dependencies.bookId, match.chapterId, match.revisionId)) {
      continue;
    }
    const chunk = dependencies.metadata.getChunk(match.vectorId);
    if (
      !chunk ||
      chunk.chapterId !== match.chapterId ||
      chunk.revisionId !== match.revisionId ||
      chunk.contentHash !== match.contentHash ||
      chunk.startOffset !== match.startOffset ||
      chunk.endOffset !== match.endOffset
    ) {
      continue;
    }
    hits.push({
      bookId: dependencies.bookId,
      chapterId: match.chapterId,
      revisionId: match.revisionId,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      content: chunk.content,
      contentHash: chunk.contentHash,
    });
  }
  return hits;
}

function resolveSearchScope(
  book: BetterSqliteDatabase,
  bookId: string,
  scope: NovelVectorSearchScope | undefined,
): ReadonlySet<string> | null {
  const upToChapterId = scope?.upToChapterId;
  const excludeChapterId = scope?.excludeChapterId;
  if (upToChapterId !== undefined && upToChapterId.trim() === "") {
    throw new NovelVectorQueryError("Chapter id is required.");
  }
  if (excludeChapterId !== undefined && excludeChapterId.trim() === "") {
    throw new NovelVectorQueryError("Chapter id is required.");
  }
  if (excludeChapterId !== undefined && !chapterExists(book, bookId, excludeChapterId)) {
    throw new NovelVectorQueryError(`Chapter does not belong to the current book: ${excludeChapterId}`);
  }
  if (upToChapterId === undefined && excludeChapterId === undefined) return null;
  const throughChapterId = upToChapterId === undefined ? null : chapterIdsThrough(book, bookId, upToChapterId);
  const ids = throughChapterId ?? publishedChapterIds(book, bookId);
  if (excludeChapterId === undefined) return new Set(ids);
  return new Set(ids.filter((id) => id !== excludeChapterId));
}

function publishedChapterIds(book: BetterSqliteDatabase, bookId: string): readonly string[] {
  const rows = book
    .prepare(
      `SELECT c.id AS id
       FROM chapters c
       LEFT JOIN volumes v ON v.id = c.volume_id
       WHERE c.book_id = ? AND c.deleted_at IS NULL
       ORDER BY CASE WHEN c.volume_id IS NULL THEN 0 ELSE 1 END, v.position, c.position, c.id`,
    )
    .all(bookId) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function chapterIdsThrough(book: BetterSqliteDatabase, bookId: string, chapterId: string): readonly string[] {
  const ids = publishedChapterIds(book, bookId);
  const index = ids.indexOf(chapterId);
  if (index < 0) {
    throw new NovelVectorQueryError(`Chapter is not in the current outline: ${chapterId}`);
  }
  return ids.slice(0, index + 1);
}

function chapterExists(book: BetterSqliteDatabase, bookId: string, chapterId: string): boolean {
  const row = book.prepare("SELECT id FROM chapters WHERE id = ? AND book_id = ?").get(chapterId, bookId);
  return row !== undefined;
}

function requirePublishedIndex(
  meta: NovelVectorIndexMeta | null,
  expected: { readonly sourceGeneration: string; readonly spaceId: string },
): void {
  if (!meta) throw new NovelVectorQueryError("Novel vector index does not exist.");
  if (meta.state === "failed") throw new NovelVectorQueryError("Novel vector index is unavailable.");
  if (
    meta.state === "building" ||
    meta.sourceGeneration !== expected.sourceGeneration ||
    meta.spaceId !== expected.spaceId ||
    meta.chunkerVersion !== NOVEL_CHUNKER_VERSION
  ) {
    throw new NovelVectorQueryError("Novel vector index is rebuilding.");
  }
}

function isCurrentRevision(
  book: BetterSqliteDatabase,
  bookId: string,
  chapterId: string,
  revisionId: string,
): boolean {
  const row = book
    .prepare(
      `SELECT deleted_at AS deletedAt, current_revision_id AS revisionId
       FROM chapters WHERE id = ? AND book_id = ?`,
    )
    .get(chapterId, bookId) as { deletedAt: number | null; revisionId: string | null } | undefined;
  return Boolean(row && row.deletedAt === null && row.revisionId === revisionId);
}
