import path from "node:path";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import NovelApplication from "./NovelApplication.ts";
import {
  getBookDeletionRoot,
  getBookLayout,
} from "../storage/book/BookLayout.ts";
import type {
  BookRecord,
  BookRegistry,
  BookTrashRecord,
} from "./bookRegistryPorts.ts";

function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export class BookDeletionCleanupError extends Error {
  constructor(
    readonly bookId: string,
    readonly cleanupPath: string,
    cause: unknown,
  ) {
    super(`Book registration was deleted but file cleanup failed: ${bookId}`, {
      cause,
    });
    this.name = "BookDeletionCleanupError";
  }
}

export default class BookLifecycleService {
  constructor(
    private readonly agentHome: string,
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
  ) {}

  moveToTrash(bookId: string): BookTrashRecord {
    const book = this.requireBook(bookId);
    if (book.state !== "available") {
      throw new Error(`Only available books can be trashed: ${bookId}`);
    }
    this.requireUnlinked(bookId);
    this.runtimes.closeBook(bookId);
    const lease = this.runtimes.acquire(bookId);
    let title: string;
    try {
      const novel = new NovelApplication(lease.persistence).getProjectBook();
      if (!novel) throw new Error(`Book contains no novel record: ${bookId}`);
      title = novel.title;
    } finally {
      lease.close();
    }
    return this.books.moveBookToTrash({
      bookId,
      title,
      trashedAt: new Date(),
    });
  }

  restoreFromTrash(bookId: string): BookRecord {
    const book = this.requireBook(bookId);
    if (book.state !== "trashed") {
      throw new Error(`Book is not in the bookshelf trash: ${bookId}`);
    }
    this.runtimes.closeBook(bookId);
    const health = this.runtimes.inspectStorage(bookId);
    return this.books.restoreBookFromTrash(bookId, health.state);
  }

  permanentlyDelete(input: {
    readonly bookId: string;
    readonly confirmationBookId: string;
  }): void {
    if (input.confirmationBookId !== input.bookId) {
      throw new Error("Permanent book deletion requires the exact book id.");
    }
    const book = this.requireBook(input.bookId);
    if (book.state !== "trashed") {
      throw new Error(`Only trashed books can be permanently deleted: ${book.id}`);
    }
    this.requireUnlinked(book.id);
    this.runtimes.closeBook(book.id);
    const layout = getBookLayout(this.agentHome, book.id);
    if (!samePath(book.storagePath, layout.rootPath)) {
      throw new Error(`Invalid registered book path: ${book.storagePath}`);
    }

    const deletionRoot = getBookDeletionRoot(this.agentHome);
    const operationId = `book_delete_${crypto.randomUUID()}`;
    const operationPath = path.resolve(
      deletionRoot,
      operationId,
    );
    if (path.dirname(operationPath) !== deletionRoot) {
      throw new Error(`Book deletion path escapes its root: ${operationPath}`);
    }
    let moved = false;
    if (existsSync(layout.rootPath)) {
      mkdirSync(deletionRoot, { recursive: true });
      renameSync(layout.rootPath, operationPath);
      moved = true;
    }
    try {
      this.books.deleteBookRegistration({
        bookId: book.id,
        operationId,
        deletedAt: new Date(),
      });
    } catch (error) {
      if (moved) {
        try {
          renameSync(operationPath, layout.rootPath);
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            `Permanent book deletion recovery failed: ${book.id}`,
          );
        }
      }
      throw error;
    }
    if (!moved) {
      this.books.updateBookDeletionCleanup(operationId, "completed");
      return;
    }
    try {
      rmSync(operationPath, { recursive: true, force: true });
    } catch (error) {
      try {
        this.books.updateBookDeletionCleanup(operationId, "failed");
      } catch (recordError) {
        throw new AggregateError(
          [error, recordError],
          `Book deletion cleanup and audit update failed: ${book.id}`,
        );
      }
      throw new BookDeletionCleanupError(book.id, operationPath, error);
    }
    this.books.updateBookDeletionCleanup(operationId, "completed");
  }

  private requireBook(bookId: string): BookRecord {
    const book = this.books.getBookById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);
    return book;
  }

  private requireUnlinked(bookId: string): void {
    if (this.books.listProjectIdsForBook(bookId).length > 0) {
      throw new Error(`Book is still attached to a project: ${bookId}`);
    }
  }
}
