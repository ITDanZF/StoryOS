import type { BookRecord, BookRegistry } from "../application/bookRegistryPorts.ts";
import type { NovelPersistence } from "../application/novelPorts.ts";
import BookDatabase from "../storage/book/BookDatabase.ts";
import BookStorageHealthInspector from "../storage/book/BookStorageHealthInspector.ts";
import type { BookStorageHealth } from "../storage/book/BookStorageHealthInspector.ts";
import SqliteNovelStore from "../storage/book/SqliteNovelStore.ts";

type ManagedBookRuntime = {
  readonly book: BookRecord;
  readonly database: BookDatabase;
  readonly persistence: SqliteNovelStore;
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

  constructor(
    agentHome: string,
    private readonly registry: BookRegistry,
  ) {
    this.healthInspector = new BookStorageHealthInspector(agentHome);
  }

  acquire(bookId: string): BookRuntimeLease {
    if (this.closed) {
      throw new BookRuntimeOpenError(
        "manager_closed",
        "Book runtime manager is closed.",
      );
    }
    const book = this.requireOpenableBook(bookId);
    let runtime = this.runtimes.get(book.id);
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
      runtime = {
        book,
        database,
        persistence: new SqliteNovelStore(database.handle),
        referenceCount: 0,
      };
      try {
        this.registry.touchOpened(book.id);
      } catch (error) {
        database.close();
        throw error;
      }
      this.runtimes.set(book.id, runtime);
    }
    const acquiredRuntime = runtime;
    acquiredRuntime.referenceCount += 1;
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
    for (const runtime of this.runtimes.values()) runtime.database.close();
    this.runtimes.clear();
  }

  inspectStorage(bookId: string): BookStorageHealth {
    const book = this.registry.getBookById(bookId);
    if (!book) {
      throw new BookRuntimeOpenError(
        "book_not_found",
        `Book not found: ${bookId}`,
      );
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
      throw new BookRuntimeOpenError(
        "book_not_found",
        `Book not found: ${bookId}`,
      );
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
  }
}
