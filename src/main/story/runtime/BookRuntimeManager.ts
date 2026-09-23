import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type BookCatalogProjection from "../storage/global/BookCatalogProjection.ts";
import type { BookRecord, BookRegistry } from "../application/books/bookRegistryPorts.ts";
import type { NovelPersistence } from "../application/books/novelPorts.ts";
import BookDatabase from "../storage/book/BookDatabase.ts";
import type { BookStorageHealth } from "../storage/book/BookStorageHealthInspector.ts";
import BookStorageHealthInspector from "../storage/book/BookStorageHealthInspector.ts";
import CatalogUpdatingBookStore from "../storage/book/CatalogUpdatingBookStore.ts";
import SqliteNovelStore from "../storage/book/SqliteNovelStore.ts";

type ManagedBookRuntime = {
  readonly book: BookRecord;
  readonly database: BookDatabase;
  readonly persistence: NovelPersistence;
  readonly reader: Pick<SqliteNovelStore, "readReaderManifest">;
  referenceCount: number;
};

export type BookRuntimeFailureCode =
  | "manager_closed"
  | "book_not_found"
  | "storage_unavailable"
  | "invalid_registered_path"
  | "missing_database"
  | "corrupted_database";

export class BookRuntimeOpenError extends Error {
  constructor(
    readonly code: BookRuntimeFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BookRuntimeOpenError";
  }
}

export type BookRuntimeLease = {
  readonly book: BookRecord;
  readonly persistence: NovelPersistence;
  readonly close: () => void;
};

export default class BookRuntimeManager {
  private readonly runtimes = new Map<string, ManagedBookRuntime>();
  private readonly healthInspector: BookStorageHealthInspector;
  private closed = false;
  private readonly catalogFiles = new Map<string, string>();
  private openedListener: ((bookId: string) => void) | null = null;

  constructor(
    agentHome: string,
    private readonly registry: BookRegistry,
    private readonly catalog?: BookCatalogProjection,
  ) {
    this.healthInspector = new BookStorageHealthInspector(agentHome);
  }

  get deviceId(): string {
    return this.catalog?.deviceId ?? "local";
  }

  setOpenedListener(listener: (bookId: string) => void): void {
    this.openedListener = listener;
  }

  listOpenBookIds(): readonly string[] {
    return Object.freeze([...this.runtimes.keys()]);
  }

  acquire(bookId: string): BookRuntimeLease {
    if (this.closed) {
      throw new BookRuntimeOpenError("manager_closed", "Book runtime manager is closed.");
    }
    const book = this.requireOpenableBook(bookId);
    let runtime = this.runtimes.get(book.id);
    let opened = false;
    if (runtime) {
      if (runtime.book.storagePath !== book.storagePath) {
        throw new BookRuntimeOpenError(
          "invalid_registered_path",
          `Registered book path changed while open: ${book.id}`,
        );
      }
    } else {
      const health = this.healthInspector.inspect(book);
      if (health.state !== "available") {
        throw new BookRuntimeOpenError(
          health.state === "missing" ? "missing_database" : "corrupted_database",
          health.reason,
          { cause: health.cause },
        );
      }
      let database: BookDatabase;
      try {
        database = new BookDatabase(health.layout.databasePath);
      } catch (error) {
        throw new BookRuntimeOpenError(
          "corrupted_database",
          `Book database is corrupted: ${book.id}`,
          { cause: error },
        );
      }
      const identity = database.handle.prepare("SELECT id FROM books").get() as
        | { id: string }
        | undefined;
      if (!identity || identity.id !== bookId) {
        database.close();
        throw new BookRuntimeOpenError("corrupted_database", `Book identity mismatch: ${bookId}`);
      }
      const persistence = new SqliteNovelStore(database.handle, this.deviceId);
      const projected = new CatalogUpdatingBookStore(persistence, () =>
        this.refreshCatalog(bookId, database),
      );
      this.refreshCatalog(bookId, database);
      runtime = {
        book,
        database,
        persistence: projected,
        reader: persistence,
        referenceCount: 0,
      };
      this.runtimes.set(book.id, runtime);
      opened = true;
    }
    const acquiredRuntime = runtime;
    acquiredRuntime.referenceCount += 1;
    if (opened) this.openedListener?.(acquiredRuntime.book.id);
    let released = false;
    return Object.freeze({
      book: acquiredRuntime.book,
      persistence: acquiredRuntime.persistence,
      close: () => {
        if (released) return;
        released = true;
        this.release(acquiredRuntime);
      },
    });
  }

  closeAll(): void {
    if (this.closed) return;
    this.closed = true;
    const errors: unknown[] = [];
    for (const runtime of this.runtimes.values()) {
      try {
        runtime.database.close();
      } catch (error) {
        errors.push(error);
      }
    }
    this.runtimes.clear();
    this.catalogFiles.clear();
    if (errors.length) throw new AggregateError(errors, "Book runtime cleanup failed");
  }

  readReaderManifest(bookId: string) {
    const lease = this.acquire(bookId);
    try {
      const runtime = this.runtimes.get(bookId);
      if (!runtime) throw new Error("Book runtime not found.");
      return runtime.reader.readReaderManifest();
    } finally {
      lease.close();
    }
  }

  readCatalog(bookId: string) {
    const book = this.requireOpenableBook(bookId);
    let fingerprint: string;
    try {
      fingerprint = this.fileFingerprint(book);
    } catch (error) {
      throw new BookRuntimeOpenError("missing_database", `Book database is missing: ${bookId}`, {
        cause: error,
      });
    }
    if (this.catalogFiles.get(bookId) !== fingerprint) {
      const health = this.inspectStorage(bookId);
      if (health.state !== "available")
        throw new BookRuntimeOpenError(
          health.state === "missing" ? "missing_database" : "corrupted_database",
          health.reason,
        );
      const lease = this.acquire(bookId);
      try {
        const runtime = this.runtimes.get(bookId);
        if (runtime) this.refreshCatalog(bookId, runtime.database);
      } finally {
        lease.close();
      }
    }
    return this.catalog?.read(bookId) ?? null;
  }

  private fileFingerprint(book: BookRecord): string {
    const file = path.join(book.storagePath, "book.sqlite");
    const data = statSync(file);
    const wal = existsSync(file + "-wal") ? statSync(file + "-wal") : null;
    return `${file}:${data.size}:${data.mtimeMs}:${wal?.size}:${wal?.mtimeMs}`;
  }

  private refreshCatalog(bookId: string, database: BookDatabase): void {
    try {
      this.catalog?.refresh(bookId, database.handle);
      const book = this.registry.getBookById(bookId);
      if (book) this.catalogFiles.set(bookId, this.fileFingerprint(book));
    } catch (error) {
      this.catalogFiles.delete(bookId);
      console.error("Book catalog refresh failed; source data remains committed", bookId, error);
    }
  }

  inspectStorage(bookId: string): BookStorageHealth {
    const book = this.registry.getBookById(bookId);
    if (!book) {
      throw new BookRuntimeOpenError("book_not_found", `Book not found: ${bookId}`);
    }
    return this.healthInspector.inspect(book);
  }

  closeBook(bookId: string): void {
    const runtime = this.runtimes.get(bookId);
    if (!runtime) return;
    if (runtime.referenceCount > 0) {
      throw new Error(`Book runtime is still in use: ${bookId}`);
    }
    this.runtimes.delete(bookId);
    runtime.database.close();
  }

  captureBook<T>(bookId: string, read: () => T): { snapshot: T; database: Buffer } {
    const lease = this.acquire(bookId);
    try {
      const runtime = this.runtimes.get(bookId);
      if (!runtime) throw new Error("Book runtime not found.");
      return runtime.database.handle.transaction(() => ({
        snapshot: read(),
        database: runtime.database.handle.serialize(),
      }))();
    } finally {
      lease.close();
    }
  }

  async backupBook(bookId: string, targetDatabasePath: string): Promise<void> {
    if (this.runtimes.has(bookId)) {
      throw new Error(`Book runtime is still in use: ${bookId}`);
    }
    const lease = this.acquire(bookId);
    try {
      const runtime = this.runtimes.get(bookId);
      if (!runtime) throw new Error(`Book runtime not found: ${bookId}`);
      await runtime.database.handle.backup(targetDatabasePath);
    } finally {
      lease.close();
    }
  }

  private requireOpenableBook(bookId: string): BookRecord {
    const book = this.registry.getBookById(bookId);
    if (!book) {
      throw new BookRuntimeOpenError("book_not_found", `Book not found: ${bookId}`);
    }
    if (book.state !== "available") {
      throw new BookRuntimeOpenError(
        "storage_unavailable",
        `Book storage is unavailable: ${book.id}`,
      );
    }
    return book;
  }

  private release(runtime: ManagedBookRuntime): void {
    const current = this.runtimes.get(runtime.book.id);
    if (current !== runtime) return;
    current.referenceCount -= 1;
    if (current.referenceCount > 0) return;
    this.runtimes.delete(runtime.book.id);
    current.database.close();
    // A failed projection must remain stale after the last lease closes.
  }
}
