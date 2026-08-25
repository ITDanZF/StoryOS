import path from "node:path";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  BookRecord,
  BookRegistry,
  BookStorageState,
} from "../../application/bookRegistryPorts.ts";

type BookRow = {
  readonly id: string;
  readonly storage_path: string;
  readonly state: BookStorageState;
  readonly created_at: number;
  readonly updated_at: number;
  readonly last_opened_at: number | null;
};

function storagePathKey(storagePath: string): string {
  const resolved = path.resolve(storagePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export default class SqliteBookStore implements BookRegistry {
  constructor(private readonly database: BetterSqliteDatabase) {}

  registerBookForProject(input: {
    readonly id: string;
    readonly projectId: string;
    readonly storagePath: string;
  }): BookRecord {
    const storagePath = path.resolve(input.storagePath);
    const now = Date.now();
    return this.database.transaction(() => {
      const existingBinding = this.database.prepare(
        "SELECT book_id FROM project_books WHERE project_id = ?",
      ).get(input.projectId) as { readonly book_id: string } | undefined;
      if (existingBinding) {
        throw new Error(`Project already has a book: ${input.projectId}`);
      }
      this.database.prepare(`
        INSERT INTO books(
          id, storage_path, path_key, state,
          created_at, updated_at, last_opened_at
        ) VALUES (?, ?, ?, 'available', ?, ?, ?)
      `).run(
        input.id,
        storagePath,
        storagePathKey(storagePath),
        now,
        now,
        now,
      );
      this.database.prepare(`
        INSERT INTO project_books(project_id, book_id, attached_at)
        VALUES (?, ?, ?)
      `).run(input.projectId, input.id, now);
      return this.requireBook(input.id);
    })();
  }

  getBookById(bookId: string): BookRecord | null {
    const row = this.database.prepare(
      "SELECT * FROM books WHERE id = ?",
    ).get(bookId) as BookRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  getBookForProject(projectId: string): BookRecord | null {
    const row = this.database.prepare(`
      SELECT books.*
      FROM project_books
      JOIN books ON books.id = project_books.book_id
      WHERE project_books.project_id = ?
    `).get(projectId) as BookRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  listBooks(): readonly BookRecord[] {
    return (this.database.prepare(`
      SELECT * FROM books
      ORDER BY COALESCE(last_opened_at, updated_at) DESC, id ASC
    `).all() as BookRow[]).map((row) => this.toRecord(row));
  }

  detachBook(projectId: string): void {
    this.database.prepare(
      "DELETE FROM project_books WHERE project_id = ?",
    ).run(projectId);
  }

  private requireBook(bookId: string): BookRecord {
    const book = this.getBookById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);
    return book;
  }

  private toRecord(row: BookRow): BookRecord {
    return Object.freeze({
      id: row.id,
      storagePath: row.storage_path,
      state: row.state,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastOpenedAt: row.last_opened_at === null
        ? null
        : new Date(row.last_opened_at),
    });
  }
}
