import { LanceDimensionError } from "../lancedb/errors.ts";
import LanceDatabase from "../lancedb/LanceDatabase.ts";
import type LanceTable from "../lancedb/LanceTable.ts";
import type { LanceTableSchema } from "../lancedb/schema.ts";
import { quoteIdentifier, sqlAnd, sqlEquals, sqlLiteral } from "../lancedb/sql.ts";

const TABLE_NAME = "vectors";

export type NovelLanceVectorRow = {
  readonly vectorId: string;
  readonly bookId: string;
  readonly chapterId: string;
  readonly revisionId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly textHash: string;
  readonly contentHash: string;
  readonly spaceId: string;
  readonly vector: readonly number[];
};

export type NovelLanceVectorHit = {
  readonly vectorId: string;
  readonly bookId: string;
  readonly chapterId: string;
  readonly revisionId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly textHash: string;
  readonly contentHash: string;
  readonly spaceId: string;
  readonly distance: number;
};

export type NovelVectorPublicationKey = {
  readonly chapterId: string;
  readonly revisionId: string;
};

export default class LanceNovelVectorStore {
  private constructor(
    private readonly database: LanceDatabase,
    private readonly table: LanceTable,
    readonly dimensions: number,
    readonly spaceId: string,
  ) {}

  static async open(directoryPath: string, spaceId: string, dimensions: number): Promise<LanceNovelVectorStore> {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new LanceDimensionError(`Vector column dimensions must be a positive integer: ${dimensions}`);
    }
    const schema = novelVectorTableSchema(dimensions);
    const database = await LanceDatabase.open(directoryPath);
    try {
      const table = (await database.hasTable(TABLE_NAME))
        ? await database.openTable(TABLE_NAME, schema)
        : await database.createTable(TABLE_NAME, schema);
      return new LanceNovelVectorStore(database, table, dimensions, spaceId);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  async merge(rows: readonly NovelLanceVectorRow[]): Promise<void> {
    rows.forEach((row) => this.requireRow(row));
    await this.table.mergeByKey(
      "vector_id",
      rows.map((row) => ({
        vector_id: row.vectorId,
        book_id: row.bookId,
        chapter_id: row.chapterId,
        revision_id: row.revisionId,
        start_offset: row.startOffset,
        end_offset: row.endOffset,
        text_hash: row.textHash,
        content_hash: row.contentHash,
        space_id: row.spaceId,
        vector: row.vector,
      })),
    );
  }

  async deleteChapter(chapterId: string): Promise<void> {
    await this.table.deleteWhere(sqlEquals("chapter_id", chapterId));
  }

  async deleteChapterExcept(chapterId: string, vectorIds: readonly string[]): Promise<void> {
    if (vectorIds.length === 0) {
      await this.deleteChapter(chapterId);
      return;
    }
    await this.table.deleteWhere(
      `${sqlEquals("chapter_id", chapterId)} AND ${quoteIdentifier("vector_id")} NOT IN (${vectorIds
        .map((id) => sqlLiteral(id))
        .join(", ")})`,
    );
  }

  async listRevision(
    chapterId: string,
    revisionId: string,
  ): Promise<readonly { readonly vectorId: string; readonly contentHash: string }[]> {
    const rows = await this.table.query({
      filter: sqlAnd([sqlEquals("chapter_id", chapterId), sqlEquals("revision_id", revisionId)]),
      select: ["vector_id", "content_hash"],
    });
    return rows.map((row) => ({
      vectorId: requireString(row.vector_id, "vector_id"),
      contentHash: requireString(row.content_hash, "content_hash"),
    }));
  }

  async listChapterIds(): Promise<readonly string[]> {
    const rows = await this.table.query({ select: ["chapter_id"] });
    return [...new Set(rows.map((row) => requireString(row.chapter_id, "chapter_id")))];
  }

  async countRevision(chapterId: string, revisionId: string): Promise<number> {
    return this.table.count(
      sqlAnd([sqlEquals("chapter_id", chapterId), sqlEquals("revision_id", revisionId)]),
    );
  }

  async search(request: {
    readonly bookId: string;
    readonly vector: readonly number[];
    readonly publications: readonly NovelVectorPublicationKey[];
    readonly limit: number;
  }): Promise<readonly NovelLanceVectorHit[]> {
    if (request.vector.length !== this.dimensions) {
      throw new LanceDimensionError(
        `Query vector has ${request.vector.length} dimensions; expected ${this.dimensions}.`,
      );
    }
    if (request.publications.length === 0) return [];
    const hits = await this.table.vectorSearch({
      vector: request.vector,
      limit: request.limit,
      metric: "cosine",
      exact: true,
      filter: publicationFilter(request.bookId, request.publications),
      select: [
        "vector_id",
        "book_id",
        "chapter_id",
        "revision_id",
        "start_offset",
        "end_offset",
        "text_hash",
        "content_hash",
        "space_id",
      ],
    });
    return hits.map((hit) => ({
      vectorId: requireString(hit.row.vector_id, "vector_id"),
      bookId: requireString(hit.row.book_id, "book_id"),
      chapterId: requireString(hit.row.chapter_id, "chapter_id"),
      revisionId: requireString(hit.row.revision_id, "revision_id"),
      startOffset: requireOffset(hit.row.start_offset, "start_offset"),
      endOffset: requireOffset(hit.row.end_offset, "end_offset"),
      textHash: requireString(hit.row.text_hash, "text_hash"),
      contentHash: requireString(hit.row.content_hash, "content_hash"),
      spaceId: requireString(hit.row.space_id, "space_id"),
      distance: hit.distance,
    }));
  }

  private requireRow(row: NovelLanceVectorRow): void {
    if (row.spaceId !== this.spaceId) {
      throw new Error(`Novel vector space mismatch: ${row.spaceId}`);
    }
    if (row.vector.length !== this.dimensions) {
      throw new LanceDimensionError(
        `Column vector has ${row.vector.length} dimensions; expected ${this.dimensions}.`,
      );
    }
    if (!Number.isInteger(row.startOffset) || row.startOffset < 0 || row.endOffset <= row.startOffset) {
      throw new Error(`Novel vector offsets are invalid: ${row.startOffset}, ${row.endOffset}`);
    }
  }
}

export function novelVectorTableSchema(dimensions: number): LanceTableSchema {
  return {
    columns: [
      { name: "vector_id", type: { kind: "utf8" } },
      { name: "book_id", type: { kind: "utf8" } },
      { name: "chapter_id", type: { kind: "utf8" } },
      { name: "revision_id", type: { kind: "utf8" } },
      { name: "start_offset", type: { kind: "int32" } },
      { name: "end_offset", type: { kind: "int32" } },
      { name: "text_hash", type: { kind: "utf8" } },
      { name: "content_hash", type: { kind: "utf8" } },
      { name: "space_id", type: { kind: "utf8" } },
      { name: "vector", type: { kind: "vector", dimensions } },
    ],
  };
}

function publicationFilter(
  bookId: string,
  publications: readonly NovelVectorPublicationKey[],
): string {
  const clauses = publications.map((publication) =>
    sqlAnd([
      sqlEquals("book_id", bookId),
      sqlEquals("chapter_id", publication.chapterId),
      sqlEquals("revision_id", publication.revisionId),
    ]),
  );
  const [only] = clauses;
  return clauses.length === 1 && only ? only : clauses.map((clause) => `(${clause})`).join(" OR ");
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`LanceDB row is missing ${label}.`);
  }
  return value;
}

function requireOffset(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`LanceDB row has an invalid ${label}.`);
  }
  return value;
}
