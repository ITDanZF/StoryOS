import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { normalizeSearchText, tokenizeSearchText } from "../../tools/text/indexing/tokenizer.ts";
import type {
  IndexedTextChunk,
  IndexedTextFile,
  RankedTextHit,
} from "../../tools/text/indexing/types.ts";
import type {
  TextIndexFileState,
  TextIndexSearchOptions,
  TextIndexStore,
} from "../../tools/text/indexing/TextIndexStore.ts";
import { pathMatches } from "../../tools/text/indexing/MemoryTextIndexStore.ts";

const HEADING_SEPARATOR = "\u001f";

type ChunkRow = {
  readonly id: string;
  readonly file_path: string;
  readonly revision: string;
  readonly chunk_index: number;
  readonly chunk_type: "heading" | "section";
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly heading_path: string;
  readonly content: string;
  readonly rank?: number;
};

export default class SqliteTextIndexStore implements TextIndexStore {
  constructor(private readonly database: BetterSqliteDatabase) {}

  listFileStates(): readonly TextIndexFileState[] {
    return this.database.prepare(`
      SELECT path, revision, size_bytes AS sizeBytes, mtime_ms AS mtimeMs
      FROM indexed_files ORDER BY path ASC
    `).all() as TextIndexFileState[];
  }

  updateFileState(state: TextIndexFileState): void {
    const result = this.database.prepare(`
      UPDATE indexed_files
      SET revision = ?, size_bytes = ?, mtime_ms = ?, indexed_at = ?
      WHERE path = ?
    `).run(
      state.revision,
      state.sizeBytes,
      state.mtimeMs,
      Date.now(),
      state.path,
    );
    if (result.changes === 0) {
      throw new Error(`Indexed file not found: ${state.path}`);
    }
  }

  replaceFile(file: IndexedTextFile, state: TextIndexFileState): void {
    this.database.transaction(() => {
      this.deleteFile(file.path);
      this.database.prepare(`
        INSERT INTO indexed_files(
          path, revision, size_bytes, mtime_ms, indexed_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        file.path,
        state.revision,
        state.sizeBytes,
        state.mtimeMs,
        Date.now(),
      );
      const insert = this.database.prepare(`
        INSERT INTO text_chunks(
          id, file_path, revision, chunk_index, chunk_type,
          start_line, start_column, end_line, end_column,
          heading_path, heading, content
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const chunk of file.chunks) {
        insert.run(
          chunk.id,
          chunk.path,
          chunk.revision,
          chunk.index,
          chunk.type,
          chunk.start.line,
          chunk.start.column,
          chunk.end.line,
          chunk.end.column,
          chunk.headingPath.join(HEADING_SEPARATOR),
          chunk.headingPath.join(" "),
          chunk.content,
        );
      }
    })();
  }

  deleteFilesNotIn(paths: ReadonlySet<string>): void {
    const existing = this.database.prepare(
      "SELECT path FROM indexed_files",
    ).all() as Array<{ path: string }>;
    this.database.transaction(() => {
      for (const row of existing) {
        if (!paths.has(row.path)) this.deleteFile(row.path);
      }
    })();
  }

  search(
    query: string,
    options: TextIndexSearchOptions = {},
  ): readonly RankedTextHit[] {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) throw new Error("Search query is required.");
    const queryTerms = [...new Set(tokenizeSearchText(query))];
    const ftsTerms = queryTerms
      .filter((term) => [...term].length >= 3)
      .map((term) => `"${term.replaceAll('"', '""')}"`);
    const rows = ftsTerms.length > 0
      ? this.database.prepare(`
          SELECT c.*, bm25(text_chunks_fts, 1.0, 2.0) AS rank
          FROM text_chunks_fts
          JOIN text_chunks c ON c.row_id = text_chunks_fts.rowid
          WHERE text_chunks_fts MATCH ?
        `).all(ftsTerms.join(" OR ")) as ChunkRow[]
      : this.database.prepare(`
          SELECT c.*, 0 AS rank
          FROM text_chunks c
          WHERE instr(lower(c.content), lower(?)) > 0
             OR instr(lower(c.heading), lower(?)) > 0
        `).all(normalizedQuery, normalizedQuery) as ChunkRow[];

    const hits: RankedTextHit[] = [];
    for (const row of rows) {
      if (!pathMatches(row.file_path, options.paths, options.glob)) continue;
      const chunk = this.toChunk(row);
      const normalizedContent = normalizeSearchText(chunk.content);
      const normalizedHeading = normalizeSearchText(
        chunk.headingPath.join(" "),
      );
      const matchedTerms = queryTerms.filter((term) =>
        normalizedContent.includes(normalizeSearchText(term)) ||
        normalizedHeading.includes(normalizeSearchText(term)));
      let score = Math.max(0.0001, -(row.rank ?? 0));
      if (normalizedContent.includes(normalizedQuery)) score += 3;
      if (normalizedHeading.includes(normalizedQuery)) score += 2;
      hits.push(Object.freeze({
        chunk,
        score: Number(score.toFixed(4)),
        matchedTerms: Object.freeze(matchedTerms),
      }));
    }
    hits.sort((left, right) => right.score - left.score ||
      left.chunk.path.localeCompare(right.chunk.path) ||
      left.chunk.index - right.chunk.index);
    return Object.freeze(hits.slice(0, options.limit ?? 20));
  }

  getChunks(
    paths?: readonly string[],
    glob?: string,
  ): readonly IndexedTextChunk[] {
    const rows = this.database.prepare(`
      SELECT * FROM text_chunks ORDER BY file_path ASC, chunk_index ASC
    `).all() as ChunkRow[];
    return Object.freeze(rows
      .filter((row) => pathMatches(row.file_path, paths, glob))
      .map((row) => this.toChunk(row)));
  }

  getNeighbors(
    chunk: IndexedTextChunk,
    radius: number,
  ): readonly IndexedTextChunk[] {
    if (radius <= 0) return Object.freeze([]);
    const rows = this.database.prepare(`
      SELECT * FROM text_chunks
      WHERE file_path = ? AND chunk_index BETWEEN ? AND ? AND id <> ?
      ORDER BY chunk_index ASC
    `).all(
      chunk.path,
      chunk.index - radius,
      chunk.index + radius,
      chunk.id,
    ) as ChunkRow[];
    return Object.freeze(rows.map((row) => this.toChunk(row)));
  }

  private deleteFile(filePath: string): void {
    this.database.prepare("DELETE FROM text_chunks WHERE file_path = ?")
      .run(filePath);
    this.database.prepare("DELETE FROM indexed_files WHERE path = ?")
      .run(filePath);
  }

  private toChunk(row: ChunkRow): IndexedTextChunk {
    const headingPath = row.heading_path
      ? row.heading_path.split(HEADING_SEPARATOR)
      : [];
    return Object.freeze({
      id: row.id,
      path: row.file_path,
      revision: row.revision,
      index: row.chunk_index,
      type: row.chunk_type,
      content: row.content,
      start: Object.freeze({
        line: row.start_line,
        column: row.start_column,
      }),
      end: Object.freeze({
        line: row.end_line,
        column: row.end_column,
      }),
      headingPath: Object.freeze(headingPath),
      tokens: tokenizeSearchText(
        `${headingPath.join(" ")} ${row.content}`,
      ),
    });
  }
}
