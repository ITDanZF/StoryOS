import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import BookCatalogReader from "./BookCatalogReader.ts";
import type ProjectBookBindingService from "./ProjectBookBindingService.ts";
import type BookRegistryReconciler from "./BookRegistryReconciler.ts";
import type BookLifecycleService from "./BookLifecycleService.ts";
import type BookTransferService from "./BookTransferService.ts";
import type ProjectArchiveService from "./ProjectArchiveService.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";
import type { BookReconciliationResult } from "./BookRegistryReconciler.ts";
import type {
  ExportBookRequest,
  ImportBookRequest,
  ImportBookResult,
} from "./bookTransferContracts.ts";
import type {
  BookshelfBookCard,
  BookshelfTrashEntry,
} from "./bookshelfContracts.ts";
import type {
  RestoreProjectArchiveRequest,
} from "./projectArchiveContracts.ts";

export default class BookshelfApplication {
  constructor(
    private readonly books: BookRegistry,
    runtimes: BookRuntimeManager,
    private readonly bindings: ProjectBookBindingService,
    private readonly reconciler: BookRegistryReconciler,
    private readonly lifecycle: BookLifecycleService,
    private readonly transfer: BookTransferService,
    private readonly projectArchives: ProjectArchiveService,
  ) {
    this.catalog = new BookCatalogReader(runtimes);
  }

  private readonly catalog: BookCatalogReader;

  listBooks(): readonly BookshelfBookCard[] {
    return Object.freeze(this.books.listBooks()
      .filter((book) => book.state !== "trashed")
      .map((book) => {
      const linkedProjectCount = this.books.listProjectIdsForBook(book.id).length;
      try {
        return this.catalog.read(book, linkedProjectCount);
      } catch (error) {
        return Object.freeze({
          availability: "unavailable",
          bookId: book.id,
          storageState: "corrupted",
          linkedProjectCount,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      }));
  }

  listTrash(): readonly BookshelfTrashEntry[] {
    return Object.freeze(this.books.listBooks()
      .filter((book) => book.state === "trashed")
      .map((book) => Object.freeze({
        bookId: book.id,
        storageState: "trashed" as const,
        trashedAt: book.updatedAt.toISOString(),
      })));
  }

  attachBookToProject(projectId: string, bookId: string): Promise<void> {
    return this.bindings.attachExistingBook(projectId, bookId);
  }

  detachBookFromProject(projectId: string): Promise<void> {
    return this.bindings.detachBook(projectId);
  }

  reconcileRegistry(): readonly BookReconciliationResult[] {
    return this.reconciler.reconcile();
  }

  moveBookToTrash(bookId: string): void {
    this.lifecycle.moveToTrash(bookId);
  }

  restoreBookFromTrash(bookId: string): void {
    this.lifecycle.restoreFromTrash(bookId);
  }

  permanentlyDeleteBook(input: {
    readonly bookId: string;
    readonly confirmationBookId: string;
  }): void {
    this.lifecycle.permanentlyDelete(input);
  }

  exportBook(request: ExportBookRequest): Promise<void> {
    return this.transfer.exportBook(request);
  }

  importBook(request: ImportBookRequest): ImportBookResult {
    return this.transfer.importBook(request);
  }

  listProjectArchives(bookId?: string) {
    return this.projectArchives.list(bookId ? { bookId } : {});
  }

  createProjectArchive(projectId: string) {
    return this.projectArchives.createForProjectDeletion(projectId);
  }

  restoreProjectArchive(request: RestoreProjectArchiveRequest) {
    return this.projectArchives.restore(request);
  }
}
