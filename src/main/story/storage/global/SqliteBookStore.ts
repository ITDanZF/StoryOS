import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import path from "node:path";
import type {
  BookRecord,
  BookRegistry,
  BookStorageState,
  BookTrashRecord,
} from "../../application/books/bookRegistryPorts.ts";

type BookRow = {
  readonly book_id: string;
  readonly local_path: string;
  readonly source_generation: string;
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
      const existingBinding = this.database
        .prepare("SELECT book_id FROM project_books WHERE project_id = ?")
        .get(input.projectId) as { readonly book_id: string } | undefined;
      if (existingBinding) {
        throw new Error(`Project already has a book: ${input.projectId}`);
      }
      this.database
        .prepare(
          `
        INSERT INTO book_registry(
          book_id, local_path, path_key, state,
          created_at, updated_at, last_opened_at
        ) VALUES (?, ?, ?, 'available', ?, ?, ?)
      `,
        )
        .run(input.id, storagePath, storagePathKey(storagePath), now, now, now);
      this.database
        .prepare(
          `
        INSERT INTO project_books(project_id, book_id, attached_at)
        VALUES (?, ?, ?)
      `,
        )
        .run(input.projectId, input.id, now);
      return this.requireBook(input.id);
    })();
  }

  registerImportedBook(input: { readonly id: string; readonly storagePath: string }): BookRecord {
    const storagePath = path.resolve(input.storagePath);
    const now = Date.now();
    this.database
      .prepare(
        `
      INSERT INTO book_registry(
        book_id, local_path, path_key, state,
        created_at, updated_at, last_opened_at
      ) VALUES (?, ?, ?, 'importing', ?, ?, NULL)
    `,
      )
      .run(input.id, storagePath, storagePathKey(storagePath), now, now);
    return this.requireBook(input.id);
  }

  registerStandaloneBook(input: { readonly id: string; readonly storagePath: string }): BookRecord {
    const storagePath = path.resolve(input.storagePath);
    const now = Date.now();
    this.database
      .prepare(
        `
      INSERT INTO book_registry(
        book_id, local_path, path_key, state,
        created_at, updated_at, last_opened_at
      ) VALUES (?, ?, ?, 'available', ?, ?, NULL)
    `,
      )
      .run(input.id, storagePath, storagePathKey(storagePath), now, now);
    return this.requireBook(input.id);
  }

  getBookById(bookId: string): BookRecord | null {
    const row = this.database
      .prepare("SELECT * FROM book_registry WHERE book_id = ?")
      .get(bookId) as BookRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  getBookForProject(projectId: string): BookRecord | null {
    const row = this.database
      .prepare(
        `
      SELECT book_registry.*
      FROM project_books
      JOIN book_registry ON book_registry.book_id = project_books.book_id
      WHERE project_books.project_id = ?
    `,
      )
      .get(projectId) as BookRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  listProjectIdsForBook(bookId: string): readonly string[] {
    const rows = this.database
      .prepare(
        `
      SELECT project_id
      FROM project_books
      WHERE book_id = ?
      ORDER BY attached_at ASC, project_id ASC
    `,
      )
      .all(bookId) as Array<{ readonly project_id: string }>;
    return Object.freeze(rows.map((row) => row.project_id));
  }

  listBooks(page?: {
    after?: string;
    limit: number;
    excludeTrashed?: boolean;
  }): readonly BookRecord[] {
    const clauses: string[] = [];
    const values: (string | number)[] = [];
    if (page?.excludeTrashed) clauses.push("state<>'trashed'");
    if (page?.after) {
      const cursor = JSON.parse(page.after) as { time: number; id: string };
      if (!Number.isSafeInteger(cursor.time) || typeof cursor.id !== "string")
        throw new Error("Invalid bookshelf cursor.");
      clauses.push(
        "(COALESCE(last_opened_at,updated_at) < ? OR (COALESCE(last_opened_at,updated_at)=? AND book_id>?))",
      );
      values.push(cursor.time, cursor.time, cursor.id);
    }
    if (page && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 500))
      throw new Error("Invalid bookshelf page size.");
    if (page) values.push(page.limit);
    return (
      this.database
        .prepare(
          `SELECT * FROM book_registry ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""}
      ORDER BY COALESCE(last_opened_at,updated_at) DESC,book_id ASC ${page ? "LIMIT ?" : ""}`,
        )
        .all(...values) as BookRow[]
    ).map((row) => this.toRecord(row));
  }

  attachExistingBook(input: { readonly projectId: string; readonly bookId: string }): void {
    this.database.transaction(() => {
      const book = this.requireBook(input.bookId);
      if (book.state !== "available") {
        throw new Error(`Book storage is unavailable: ${book.id}`);
      }
      const existingBinding = this.database
        .prepare("SELECT book_id FROM project_books WHERE project_id = ?")
        .get(input.projectId) as { readonly book_id: string } | undefined;
      if (existingBinding?.book_id === input.bookId) return;
      if (existingBinding) {
        throw new Error(`Project already has a book: ${input.projectId}`);
      }
      const existingWriter = this.database
        .prepare("SELECT project_id FROM project_books WHERE book_id = ?")
        .get(input.bookId) as { readonly project_id: string } | undefined;
      if (existingWriter) {
        throw new Error(`Book is already attached to a writable project: ${input.bookId}`);
      }
      this.database
        .prepare(
          `
        INSERT INTO project_books(project_id, book_id, attached_at)
        VALUES (?, ?, ?)
      `,
        )
        .run(input.projectId, input.bookId, Date.now());
    })();
  }

  detachBook(projectId: string): void {
    this.database.prepare("DELETE FROM project_books WHERE project_id = ?").run(projectId);
  }

  updateStorageState(bookId: string, state: BookStorageState): BookRecord {
    const result = this.database
      .prepare(
        `
      UPDATE book_registry
      SET state = ?, updated_at = ?
      WHERE book_id = ?
    `,
      )
      .run(state, Date.now(), bookId);
    if (result.changes !== 1) throw new Error(`Book not found: ${bookId}`);
    return this.requireBook(bookId);
  }

  listTrash(): readonly BookTrashRecord[] {
    const rows = this.database
      .prepare(
        `SELECT r.book_id,c.title,r.trashed_at,r.updated_at
      FROM book_registry r JOIN book_catalog c ON c.book_id=r.book_id
      WHERE r.state='trashed' ORDER BY r.trashed_at DESC,r.book_id`,
      )
      .all() as BookTrashRow[];
    return Object.freeze(
      rows.map((row) => {
        if (row.title === null || row.trashed_at === null)
          throw new Error("Invalid trash projection");
        return Object.freeze({
          bookId: row.book_id,
          title: row.title,
          trashedAt: new Date(row.trashed_at),
        });
      }),
    );
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
        throw new Error(`Only available book_registry can be trashed: ${input.bookId}`);
      }
      const linkedProject = this.database
        .prepare("SELECT project_id FROM project_books WHERE book_id = ?")
        .get(input.bookId) as { readonly project_id: string } | undefined;
      if (linkedProject) {
        throw new Error(`Book is still attached to a project: ${input.bookId}`);
      }
      const trashedAt = input.trashedAt.getTime();
      const catalog = this.database
        .prepare("SELECT title FROM book_catalog WHERE book_id=?")
        .get(input.bookId);
      if (!catalog) throw new Error("Book catalog must be refreshed before trashing a book.");
      this.database
        .prepare(
          `UPDATE book_registry SET state='trashed',trashed_at=?,updated_at=? WHERE book_id=?`,
        )
        .run(trashedAt, trashedAt, input.bookId);
      return Object.freeze({
        bookId: input.bookId,
        title,
        trashedAt: new Date(trashedAt),
      });
    })();
  }

  restoreBookFromTrash(bookId: string, state: "available" | "missing" | "corrupted"): BookRecord {
    return this.database.transaction(() => {
      const book = this.requireBook(bookId);
      if (book.state !== "trashed") {
        throw new Error(`Book is not in the bookshelf trash: ${bookId}`);
      }
      this.database
        .prepare(`UPDATE book_registry SET state=?,trashed_at=NULL,updated_at=? WHERE book_id=?`)
        .run(state, Date.now(), bookId);
      return this.requireBook(bookId);
    })();
  }

  touchOpened(bookId: string): BookRecord {
    const result = this.database
      .prepare(
        `
      UPDATE book_registry
      SET last_opened_at = ?
      WHERE book_id = ?
    `,
      )
      .run(Date.now(), bookId);
    if (result.changes !== 1) throw new Error(`Book not found: ${bookId}`);
    return this.requireBook(bookId);
  }

  beginBookCleanup(input: { operationId: string; bookId: string; stagingPath: string }): void {
    this.database.transaction(() => {
      const now = Date.now();
      this.database
        .prepare(
          `INSERT INTO storage_operations(id,idempotency_key,kind,state,phase,book_id,created_at,updated_at)
        VALUES (?,?,'book_cleanup','running','preparing',?,?,?)`,
        )
        .run(input.operationId, input.operationId, input.bookId, now, now);
      this.database
        .prepare(`INSERT INTO book_cleanup_details VALUES (?,?,?,'pending',?,?)`)
        .run(
          input.operationId,
          input.bookId,
          path.resolve(input.stagingPath),
          now,
          input.operationId,
        );
    })();
  }

  listPendingBookCleanups() {
    return this.database
      .prepare(
        `SELECT operation_id AS operationId,d.book_id AS bookId,staging_path AS stagingPath
      FROM book_cleanup_details d JOIN storage_operations o ON o.id=d.operation_id
      WHERE d.cleanup_state IN ('pending','failed') ORDER BY o.created_at`,
      )
      .all() as { operationId: string; bookId: string; stagingPath: string }[];
  }

  deleteBookRegistration(input: {
    readonly bookId: string;
    readonly operationId: string;
    readonly deletedAt: Date;
    readonly stagingPath?: string;
  }): void {
    this.database.transaction(() => {
      const linkedProject = this.database
        .prepare("SELECT project_id FROM project_books WHERE book_id = ?")
        .get(input.bookId) as { readonly project_id: string } | undefined;
      if (linkedProject) {
        throw new Error(`Book is still attached to a project: ${input.bookId}`);
      }
      const deletedAt = input.deletedAt.getTime();
      const operation = this.database
        .prepare(`SELECT book_id FROM book_cleanup_details WHERE operation_id=?`)
        .get(input.operationId) as { book_id: string } | undefined;
      if (!operation || operation.book_id !== input.bookId)
        throw new Error("Book cleanup must be prepared before deleting registration.");
      this.database
        .prepare(
          `UPDATE storage_operations SET phase='registration_deleted',updated_at=? WHERE id=?`,
        )
        .run(deletedAt, input.operationId);
      const result = this.database
        .prepare("DELETE FROM book_registry WHERE book_id = ?")
        .run(input.bookId);
      if (result.changes !== 1) {
        throw new Error(`Book not found: ${input.bookId}`);
      }
    })();
  }

  updateBookDeletionCleanup(operationId: string, state: "completed" | "failed"): void {
    this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE book_cleanup_details SET cleanup_state=?,cleanup_updated_at=? WHERE operation_id=?`,
        )
        .run(state, Date.now(), operationId);
      if (result.changes !== 1)
        throw new Error(`Book deletion operation not found: ${operationId}`);
      this.database
        .prepare(`UPDATE storage_operations SET state=?,phase=?,updated_at=? WHERE id=?`)
        .run(state, state, Date.now(), operationId);
    })();
  }

  abandonImportedBook(bookId: string): void {
    const result = this.database
      .prepare("DELETE FROM book_registry WHERE book_id = ? AND state = 'importing'")
      .run(bookId);
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
      this.database
        .prepare("DELETE FROM project_books WHERE project_id = ? AND book_id = ?")
        .run(input.projectId, input.bookId);
      this.database.prepare("DELETE FROM book_registry WHERE book_id = ?").run(input.bookId);
    })();
  }

  private requireBook(bookId: string): BookRecord {
    const book = this.getBookById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);
    return book;
  }

  private toRecord(row: BookRow): BookRecord {
    return Object.freeze({
      id: row.book_id,
      storagePath: row.local_path,
      sourceGeneration: row.source_generation,
      state: row.state,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastOpenedAt: row.last_opened_at === null ? null : new Date(row.last_opened_at),
    });
  }
}
