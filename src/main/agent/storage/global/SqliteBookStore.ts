import path from "node:path";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  BookRecord,
  BookRegistry,
  BookStorageState,
  BookTrashRecord,
} from "../../application/bookRegistryPorts.ts";

type BookRow = {
  readonly id: string;
  readonly storage_path: string;
  readonly state: BookStorageState;
  readonly created_at: number;
  readonly updated_at: number;
  readonly last_opened_at: number | null;
};

type BookTrashRow = {
  readonly book_id: string;
  readonly title: string | null;
  readonly trashed_at: number | null;
  readonly updated_at: number;
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

  registerImportedBook(input: {
    readonly id: string;
    readonly storagePath: string;
  }): BookRecord {
    const storagePath = path.resolve(input.storagePath);
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO books(
        id, storage_path, path_key, state,
        created_at, updated_at, last_opened_at
      ) VALUES (?, ?, ?, 'importing', ?, ?, NULL)
    `).run(
      input.id,
      storagePath,
      storagePathKey(storagePath),
      now,
      now,
    );
    return this.requireBook(input.id);
  }

  registerStandaloneBook(input: {
    readonly id: string;
    readonly storagePath: string;
  }): BookRecord {
    const storagePath = path.resolve(input.storagePath);
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO books(
        id, storage_path, path_key, state,
        created_at, updated_at, last_opened_at
      ) VALUES (?, ?, ?, 'available', ?, ?, NULL)
    `).run(
      input.id,
      storagePath,
      storagePathKey(storagePath),
      now,
      now,
    );
    return this.requireBook(input.id);
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

  listProjectIdsForBook(bookId: string): readonly string[] {
    const rows = this.database.prepare(`
      SELECT project_id
      FROM project_books
      WHERE book_id = ?
      ORDER BY attached_at ASC, project_id ASC
    `).all(bookId) as Array<{ readonly project_id: string }>;
    return Object.freeze(rows.map((row) => row.project_id));
  }

  listBooks(): readonly BookRecord[] {
    return (this.database.prepare(`
      SELECT * FROM books
      ORDER BY COALESCE(last_opened_at, updated_at) DESC, id ASC
    `).all() as BookRow[]).map((row) => this.toRecord(row));
  }

  attachExistingBook(input: {
    readonly projectId: string;
    readonly bookId: string;
  }): void {
    this.database.transaction(() => {
      const book = this.requireBook(input.bookId);
      if (book.state !== "available") {
        throw new Error(`Book storage is unavailable: ${book.id}`);
      }
      const existingBinding = this.database.prepare(
        "SELECT book_id FROM project_books WHERE project_id = ?",
      ).get(input.projectId) as { readonly book_id: string } | undefined;
      if (existingBinding?.book_id === input.bookId) return;
      if (existingBinding) {
        throw new Error(`Project already has a book: ${input.projectId}`);
      }
      const existingWriter = this.database.prepare(
        "SELECT project_id FROM project_books WHERE book_id = ?",
      ).get(input.bookId) as { readonly project_id: string } | undefined;
      if (existingWriter) {
        throw new Error(
          `Book is already attached to a writable project: ${input.bookId}`,
        );
      }
      this.database.prepare(`
        INSERT INTO project_books(project_id, book_id, attached_at)
        VALUES (?, ?, ?)
      `).run(input.projectId, input.bookId, Date.now());
    })();
  }

  detachBook(projectId: string): void {
    this.database.prepare(
      "DELETE FROM project_books WHERE project_id = ?",
    ).run(projectId);
  }

  updateStorageState(bookId: string, state: BookStorageState): BookRecord {
    const result = this.database.prepare(`
      UPDATE books
      SET state = ?, updated_at = ?
      WHERE id = ?
    `).run(state, Date.now(), bookId);
    if (result.changes !== 1) throw new Error(`Book not found: ${bookId}`);
    return this.requireBook(bookId);
  }

  listTrash(): readonly BookTrashRecord[] {
    const rows = this.database.prepare(`
      SELECT
        books.id AS book_id,
        book_trash_entries.title,
        book_trash_entries.trashed_at,
        books.updated_at
      FROM books
      LEFT JOIN book_trash_entries
        ON book_trash_entries.book_id = books.id
      WHERE books.state = 'trashed'
      ORDER BY COALESCE(book_trash_entries.trashed_at, books.updated_at) DESC,
        books.id ASC
    `).all() as BookTrashRow[];
    return Object.freeze(rows.map((row) => Object.freeze({
      bookId: row.book_id,
      title: row.title ?? row.book_id,
      trashedAt: new Date(row.trashed_at ?? row.updated_at),
    })));
  }

  moveBookToTrash(input: {
    readonly bookId: string;
    readonly title: string;
    readonly trashedAt: Date;
  }): BookTrashRecord {
    const title = input.title.trim();
    if (!title) throw new Error("Book trash title is required.");
    return this.database.transaction(() => {
      const book = this.requireBook(input.bookId);
      if (book.state !== "available") {
        throw new Error(`Only available books can be trashed: ${input.bookId}`);
      }
      const linkedProject = this.database.prepare(
        "SELECT project_id FROM project_books WHERE book_id = ?",
      ).get(input.bookId) as { readonly project_id: string } | undefined;
      if (linkedProject) {
        throw new Error(`Book is still attached to a project: ${input.bookId}`);
      }
      const trashedAt = input.trashedAt.getTime();
      this.database.prepare(`
        INSERT INTO book_trash_entries(book_id, title, trashed_at)
        VALUES (?, ?, ?)
      `).run(input.bookId, title, trashedAt);
      this.database.prepare(`
        UPDATE books
        SET state = 'trashed', updated_at = ?
        WHERE id = ?
      `).run(trashedAt, input.bookId);
      return Object.freeze({
        bookId: input.bookId,
        title,
        trashedAt: new Date(trashedAt),
      });
    })();
  }

  restoreBookFromTrash(
    bookId: string,
    state: "available" | "missing" | "corrupted",
  ): BookRecord {
    return this.database.transaction(() => {
      const book = this.requireBook(bookId);
      if (book.state !== "trashed") {
        throw new Error(`Book is not in the bookshelf trash: ${bookId}`);
      }
      this.database.prepare(
        "DELETE FROM book_trash_entries WHERE book_id = ?",
      ).run(bookId);
      this.database.prepare(`
        UPDATE books
        SET state = ?, updated_at = ?
        WHERE id = ?
      `).run(state, Date.now(), bookId);
      return this.requireBook(bookId);
    })();
  }

  touchOpened(bookId: string): BookRecord {
    const result = this.database.prepare(`
      UPDATE books
      SET last_opened_at = ?
      WHERE id = ?
    `).run(Date.now(), bookId);
    if (result.changes !== 1) throw new Error(`Book not found: ${bookId}`);
    return this.requireBook(bookId);
  }

  deleteBookRegistration(input: {
    readonly bookId: string;
    readonly operationId: string;
    readonly deletedAt: Date;
  }): void {
    this.database.transaction(() => {
      const linkedProject = this.database.prepare(
        "SELECT project_id FROM project_books WHERE book_id = ?",
      ).get(input.bookId) as { readonly project_id: string } | undefined;
      if (linkedProject) {
        throw new Error(`Book is still attached to a project: ${input.bookId}`);
      }
      const deletedAt = input.deletedAt.getTime();
      this.database.prepare(`
        INSERT INTO book_deletion_log(
          operation_id, book_id, deleted_at,
          cleanup_state, cleanup_updated_at
        ) VALUES (?, ?, ?, 'pending', ?)
      `).run(input.operationId, input.bookId, deletedAt, deletedAt);
      const result = this.database.prepare(
        "DELETE FROM books WHERE id = ?",
      ).run(input.bookId);
      if (result.changes !== 1) {
        throw new Error(`Book not found: ${input.bookId}`);
      }
    })();
  }

  updateBookDeletionCleanup(
    operationId: string,
    state: "completed" | "failed",
  ): void {
    const result = this.database.prepare(`
      UPDATE book_deletion_log
      SET cleanup_state = ?, cleanup_updated_at = ?
      WHERE operation_id = ?
    `).run(state, Date.now(), operationId);
    if (result.changes !== 1) {
      throw new Error(`Book deletion operation not found: ${operationId}`);
    }
  }

  abandonImportedBook(bookId: string): void {
    const result = this.database.prepare(
      "DELETE FROM books WHERE id = ? AND state = 'importing'",
    ).run(bookId);
    if (result.changes !== 1) {
      throw new Error(`Importing book not found: ${bookId}`);
    }
  }

  rollbackRestoredBook(input: {
    readonly bookId: string;
    readonly projectId: string;
    readonly storagePath: string;
  }): void {
    this.database.transaction(() => {
      const book = this.requireBook(input.bookId);
      if (storagePathKey(book.storagePath) !== storagePathKey(input.storagePath)) {
        throw new Error(`Restored book path changed: ${input.bookId}`);
      }
      const bindings = this.listProjectIdsForBook(input.bookId);
      if (bindings.length !== 1 || bindings[0] !== input.projectId) {
        throw new Error(`Restored book binding changed: ${input.bookId}`);
      }
      this.database.prepare(
        "DELETE FROM project_books WHERE project_id = ? AND book_id = ?",
      ).run(input.projectId, input.bookId);
      this.database.prepare("DELETE FROM books WHERE id = ?").run(input.bookId);
    })();
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
