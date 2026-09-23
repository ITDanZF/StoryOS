import { existsSync, lstatSync, rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  ALIYUN_TEXT_EMBEDDING_MODEL,
  type AliyunEmbeddingDimensions,
} from "../../../../shared/contracts/settings/contracts.ts";
import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";
import { NOVEL_CHUNKER_VERSION } from "./chunkNovelText.ts";
import { parseNovelVectorSpaceId } from "../book/BookVectorPaths.ts";

export const NOVEL_VECTOR_METADATA_APPLICATION_ID = 0x53544f56;
export const NOVEL_VECTOR_METADATA_VERSION = 1;
export const NOVEL_VECTOR_METRIC = "cosine";

const SCHEMA = `
CREATE TABLE index_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  source_generation TEXT NOT NULL,
  last_sequence INTEGER NOT NULL,
  space_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  metric TEXT NOT NULL,
  chunker_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('building', 'published', 'failed')),
  error_message TEXT,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE chapter_publications (
  chapter_id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
  published_at INTEGER NOT NULL
) STRICT;

CREATE TABLE novel_chunks (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  UNIQUE (chapter_id, revision_id, ordinal)
) STRICT;
`;

const migrations: readonly SqliteMigration[] = [
  {
    version: NOVEL_VECTOR_METADATA_VERSION,
    up(database) {
      database.exec(SCHEMA);
    },
  },
];

export type NovelVectorIndexState = "building" | "published" | "failed";

export type NovelVectorIndexMeta = {
  readonly sourceGeneration: string;
  readonly lastSequence: number;
  readonly spaceId: string;
  readonly modelName: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
  readonly dimensions: AliyunEmbeddingDimensions;
  readonly metric: typeof NOVEL_VECTOR_METRIC;
  readonly chunkerVersion: number;
  readonly state: NovelVectorIndexState;
  readonly errorMessage: string | null;
  readonly updatedAt: number;
};

export type NovelVectorPublication = {
  readonly chapterId: string;
  readonly revisionId: string;
  readonly textHash: string;
  readonly chunkCount: number;
  readonly publishedAt: number;
};

export type NovelVectorChunkRow = {
  readonly id: string;
  readonly chapterId: string;
  readonly revisionId: string;
  readonly ordinal: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly contentHash: string;
  readonly content: string;
};

export type NovelVectorSpaceIdentity = {
  readonly sourceGeneration: string;
  readonly spaceId: string;
  readonly modelName: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
  readonly dimensions: AliyunEmbeddingDimensions;
  readonly metric: typeof NOVEL_VECTOR_METRIC;
  readonly chunkerVersion: typeof NOVEL_CHUNKER_VERSION;
};

type MetaRow = {
  source_generation: string;
  last_sequence: number;
  space_id: string;
  model_name: string;
  dimensions: number;
  metric: string;
  chunker_version: number;
  state: string;
  error_message: string | null;
  updated_at: number;
};

export class NovelVectorMetadataUnavailableError extends Error {
  constructor() {
    super("Novel vector metadata is unavailable.");
    this.name = "NovelVectorMetadataUnavailableError";
  }
}

export default class NovelVectorMetadata extends SqliteDatabase {
  static open(vectorsRoot: string): NovelVectorMetadata {
    const root = path.resolve(vectorsRoot);
    rejectSymlink(root);
    const metadataPath = path.join(root, "metadata.sqlite");
    rejectSymlink(metadataPath);
    if (existsSync(metadataPath) && metadataStatus(metadataPath) === "rebuild") {
      rmSync(root, { recursive: true, force: true });
    }
    return new NovelVectorMetadata(metadataPath);
  }

  static openExisting(vectorsRoot: string): NovelVectorMetadata {
    const root = path.resolve(vectorsRoot);
    rejectSymlink(root);
    const metadataPath = path.join(root, "metadata.sqlite");
    rejectSymlink(metadataPath);
    if (!existsSync(metadataPath) || metadataStatus(metadataPath) !== "current") {
      throw new NovelVectorMetadataUnavailableError();
    }
    return new NovelVectorMetadata(metadataPath);
  }

  private constructor(metadataPath: string) {
    super(metadataPath, NOVEL_VECTOR_METADATA_APPLICATION_ID, migrations);
  }

  getIndexMeta(): NovelVectorIndexMeta | null {
    const row = this.handle.prepare("SELECT * FROM index_meta WHERE singleton = 1").get() as
      | MetaRow
      | undefined;
    return row ? toIndexMeta(row) : null;
  }

  listPublications(): readonly NovelVectorPublication[] {
    const rows = this.handle
      .prepare(
        `SELECT chapter_id, revision_id, text_hash, chunk_count, published_at
         FROM chapter_publications ORDER BY chapter_id`,
      )
      .all() as Array<{
      chapter_id: string;
      revision_id: string;
      text_hash: string;
      chunk_count: number;
      published_at: number;
    }>;
    return rows.map((row) => ({
      chapterId: row.chapter_id,
      revisionId: row.revision_id,
      textHash: row.text_hash,
      chunkCount: row.chunk_count,
      publishedAt: row.published_at,
    }));
  }

  getChunk(id: string): NovelVectorChunkRow | null {
    requireText(id, "Chunk id");
    const row = this.handle
      .prepare(
        `SELECT id, chapter_id, revision_id, ordinal, start_offset, end_offset, content_hash, content
         FROM novel_chunks WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          chapter_id: string;
          revision_id: string;
          ordinal: number;
          start_offset: number;
          end_offset: number;
          content_hash: string;
          content: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      chapterId: row.chapter_id,
      revisionId: row.revision_id,
      ordinal: row.ordinal,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      contentHash: row.content_hash,
      content: row.content,
    };
  }

  listChapterChunks(chapterId: string): readonly NovelVectorChunkRow[] {
    const rows = this.handle
      .prepare(
        `SELECT id, chapter_id, revision_id, ordinal, start_offset, end_offset, content_hash, content
         FROM novel_chunks WHERE chapter_id = ? ORDER BY ordinal`,
      )
      .all(chapterId) as Array<{
      id: string;
      chapter_id: string;
      revision_id: string;
      ordinal: number;
      start_offset: number;
      end_offset: number;
      content_hash: string;
      content: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      chapterId: row.chapter_id,
      revisionId: row.revision_id,
      ordinal: row.ordinal,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      contentHash: row.content_hash,
      content: row.content,
    }));
  }

  publishChapter(
    identity: NovelVectorSpaceIdentity,
    publication: {
      readonly lastSequence: number;
      readonly chapterId: string;
      readonly revisionId: string;
      readonly textHash: string;
      readonly publishedAt: number;
      readonly chunks: readonly NovelVectorChunkRow[];
    },
  ): void {
    requireIdentity(identity);
    requireSequence(publication.lastSequence);
    requireText(publication.chapterId, "Chapter id");
    requireText(publication.revisionId, "Revision id");
    requireText(publication.textHash, "Text hash");
    this.handle.transaction(() => {
      this.assertCompatibleIdentity(identity, publication.lastSequence);
      this.handle.prepare("DELETE FROM novel_chunks WHERE chapter_id = ?").run(publication.chapterId);
      const insert = this.handle.prepare(
        `INSERT INTO novel_chunks(
           id, chapter_id, revision_id, ordinal, start_offset, end_offset, content_hash, content
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      publication.chunks.forEach((chunk, index) => {
        if (chunk.chapterId !== publication.chapterId || chunk.revisionId !== publication.revisionId) {
          throw new Error("Novel vector chunk does not belong to the published chapter.");
        }
        if (chunk.ordinal !== index) {
          throw new Error(`Novel vector chunk ordinal mismatch: ${chunk.ordinal}`);
        }
        insert.run(
          chunk.id,
          chunk.chapterId,
          chunk.revisionId,
          chunk.ordinal,
          chunk.startOffset,
          chunk.endOffset,
          chunk.contentHash,
          chunk.content,
        );
      });
      this.handle
        .prepare(
          `INSERT INTO chapter_publications(chapter_id, revision_id, text_hash, chunk_count, published_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(chapter_id) DO UPDATE SET
             revision_id = excluded.revision_id,
             text_hash = excluded.text_hash,
             chunk_count = excluded.chunk_count,
             published_at = excluded.published_at`,
        )
        .run(
          publication.chapterId,
          publication.revisionId,
          publication.textHash,
          publication.chunks.length,
          publication.publishedAt,
        );
      this.writeMeta(identity, publication.lastSequence, "published", null);
    })();
  }

  advanceCursor(
    identity: NovelVectorSpaceIdentity,
    cursor: { readonly lastSequence: number; readonly updatedAt: number },
  ): void {
    requireIdentity(identity);
    requireSequence(cursor.lastSequence);
    this.handle.transaction(() => {
      this.assertCompatibleIdentity(identity, cursor.lastSequence);
      this.writeMeta(identity, cursor.lastSequence, "published", null, cursor.updatedAt);
    })();
  }

  removeChapter(
    identity: NovelVectorSpaceIdentity,
    chapter: { readonly chapterId: string; readonly lastSequence: number; readonly updatedAt: number },
  ): void {
    requireIdentity(identity);
    requireSequence(chapter.lastSequence);
    requireText(chapter.chapterId, "Chapter id");
    this.handle.transaction(() => {
      this.assertCompatibleIdentity(identity, chapter.lastSequence);
      this.handle.prepare("DELETE FROM novel_chunks WHERE chapter_id = ?").run(chapter.chapterId);
      this.handle.prepare("DELETE FROM chapter_publications WHERE chapter_id = ?").run(chapter.chapterId);
      this.writeMeta(identity, chapter.lastSequence, "published", null, chapter.updatedAt);
    })();
  }

  markFailed(
    identity: NovelVectorSpaceIdentity,
    failure: { readonly lastSequence: number; readonly errorMessage: string; readonly updatedAt: number },
  ): void {
    requireIdentity(identity);
    requireSequence(failure.lastSequence);
    requireText(failure.errorMessage, "Error message");
    this.handle.transaction(() => {
      const existing = this.readMetaRow();
      if (existing && !sameIdentity(existing, identity)) {
        throw new Error("Novel vector metadata space does not match the failure record.");
      }
      if (existing && failure.lastSequence !== existing.last_sequence) {
        throw new Error("A failed novel vector update cannot move the cursor.");
      }
      this.writeMeta(identity, failure.lastSequence, "failed", failure.errorMessage, failure.updatedAt);
    })();
  }

  private assertCompatibleIdentity(identity: NovelVectorSpaceIdentity, lastSequence: number): void {
    const existing = this.readMetaRow();
    if (!existing) return;
    if (!sameIdentity(existing, identity)) {
      throw new Error("Novel vector metadata space does not match the publication.");
    }
    if (lastSequence < existing.last_sequence) {
      throw new Error("Novel vector cursor cannot move backwards.");
    }
  }

  private writeMeta(
    identity: NovelVectorSpaceIdentity,
    lastSequence: number,
    state: NovelVectorIndexState,
    errorMessage: string | null,
    updatedAt = Date.now(),
  ): void {
    this.handle
      .prepare(
        `INSERT INTO index_meta(
           singleton, source_generation, last_sequence, space_id, model_name, dimensions, metric,
           chunker_version, state, error_message, updated_at
         ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           last_sequence = excluded.last_sequence,
           state = excluded.state,
           error_message = excluded.error_message,
           updated_at = excluded.updated_at`,
      )
      .run(
        identity.sourceGeneration,
        lastSequence,
        identity.spaceId,
        identity.modelName,
        identity.dimensions,
        identity.metric,
        identity.chunkerVersion,
        state,
        errorMessage,
        updatedAt,
      );
  }

  private readMetaRow(): MetaRow | undefined {
    return this.handle.prepare("SELECT * FROM index_meta WHERE singleton = 1").get() as MetaRow | undefined;
  }
}

function metadataStatus(metadataPath: string): "current" | "rebuild" {
  try {
    const database = new Database(metadataPath, { readonly: true, fileMustExist: true });
    try {
      const applicationId = database.pragma("application_id", { simple: true }) as number;
      const version = database.pragma("user_version", { simple: true }) as number;
      if (
        applicationId !== NOVEL_VECTOR_METADATA_APPLICATION_ID ||
        version !== NOVEL_VECTOR_METADATA_VERSION
      ) {
        return "rebuild";
      }
      const integrity = database.pragma("quick_check(1)") as Array<{ quick_check: string }>;
      return integrity.length === 1 && integrity[0]?.quick_check === "ok" ? "current" : "rebuild";
    } finally {
      database.close();
    }
  } catch (error) {
    if (isUnreadableDatabase(error)) return "rebuild";
    throw error;
  }
}

function isUnreadableDatabase(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "SQLITE_NOTADB" || error.code === "SQLITE_CORRUPT";
}

function rejectSymlink(target: string): void {
  try {
    if (lstatSync(target).isSymbolicLink()) {
      throw new Error(`Vector path must not be a symbolic link: ${target}`);
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

function requireIdentity(identity: NovelVectorSpaceIdentity): void {
  requireText(identity.sourceGeneration, "Source generation");
  const dimensions = parseNovelVectorSpaceId(identity.spaceId);
  if (identity.modelName !== ALIYUN_TEXT_EMBEDDING_MODEL) {
    throw new Error(`Unsupported novel vector model: ${identity.modelName}`);
  }
  if (identity.dimensions !== dimensions) {
    throw new Error(`Novel vector dimensions do not match ${identity.spaceId}.`);
  }
  if (identity.metric !== NOVEL_VECTOR_METRIC) {
    throw new Error(`Unsupported novel vector metric: ${identity.metric}`);
  }
  if (identity.chunkerVersion !== NOVEL_CHUNKER_VERSION) {
    throw new Error(`Unsupported novel chunker version: ${identity.chunkerVersion}`);
  }
}

function sameIdentity(row: MetaRow, identity: NovelVectorSpaceIdentity): boolean {
  return (
    row.source_generation === identity.sourceGeneration &&
    row.space_id === identity.spaceId &&
    row.model_name === identity.modelName &&
    row.dimensions === identity.dimensions &&
    row.metric === identity.metric &&
    row.chunker_version === identity.chunkerVersion
  );
}

function toIndexMeta(row: MetaRow): NovelVectorIndexMeta {
  if (row.state !== "building" && row.state !== "published" && row.state !== "failed") {
    throw new Error(`Unsupported novel vector index state: ${row.state}`);
  }
  if (row.model_name !== ALIYUN_TEXT_EMBEDDING_MODEL) {
    throw new Error(`Unsupported novel vector model: ${row.model_name}`);
  }
  if (row.metric !== NOVEL_VECTOR_METRIC) {
    throw new Error(`Unsupported novel vector metric: ${row.metric}`);
  }
  const dimensions = parseNovelVectorSpaceId(row.space_id);
  if (row.dimensions !== dimensions) {
    throw new Error(`Novel vector dimensions do not match ${row.space_id}.`);
  }
  return {
    sourceGeneration: row.source_generation,
    lastSequence: row.last_sequence,
    spaceId: row.space_id,
    modelName: row.model_name,
    dimensions,
    metric: row.metric,
    chunkerVersion: row.chunker_version,
    state: row.state,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}

function requireSequence(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Novel vector cursor must be a non-negative integer: ${value}`);
  }
}

function requireText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}
