import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import BookCatalogReader from "./BookCatalogReader.ts";
import type ProjectBookBindingService from "./ProjectBookBindingService.ts";
import type BookRegistryReconciler from "./BookRegistryReconciler.ts";
import type BookLifecycleService from "./BookLifecycleService.ts";
import type BookTransferService from "./BookTransferService.ts";
import type ProjectArchiveService from "./ProjectArchiveService.ts";
import type BookProvisioningService from "./BookProvisioningService.ts";
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
  CreateBookshelfBookRequest,
  CreateBookshelfBookResult,
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
    private readonly provisioning: BookProvisioningService,
  ) {
    this.catalog = new BookCatalogReader(runtimes);
  }

  private readonly catalog: BookCatalogReader;

  listBooks(): readonly BookshelfBookCard[] {
    return Object.freeze(this.books.listBooks()
      .filter((book) => book.state !== "trashed")
      .map((book) => {
      const linkedProjectIds = this.books.listProjectIdsForBook(book.id);
      try {
        return this.catalog.read(book, linkedProjectIds);
      } catch (error) {
        return Object.freeze({
          availability: "unavailable",
          bookId: book.id,
          storageState: "corrupted",
          linkedProjectId: linkedProjectIds[0] ?? null,
          linkedProjectCount: linkedProjectIds.length,
          lastOpenedAt: book.lastOpenedAt?.toISOString() ?? null,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      }));
  }

  createBook(
    request: CreateBookshelfBookRequest,
  ): CreateBookshelfBookResult {
    const title = request.title.trim();
    if (!title) throw new Error("Book title is required.");
    if (title.length > 200) {
      throw new Error("Book title must be 200 characters or fewer.");
    }
    const synopsis = request.synopsis.trim();
    if (synopsis.length > 20_000) {
      throw new Error("Book synopsis must be 20000 characters or fewer.");
    }
    const provisioned = this.provisioning.createStandalone({
      id: `novel_${crypto.randomUUID()}`,
      title,
      synopsis,
      status: "planning",
    });
    const registered = this.books.getBookById(provisioned.bookId);
    if (!registered) {
      throw new Error(`Provisioned book was not registered: ${provisioned.bookId}`);
    }
    const card = this.catalog.read(registered, []);
    if (card.availability !== "ready") {
      throw new Error(`Provisioned book is unavailable: ${provisioned.bookId}`);
    }
    return Object.freeze({
      bookId: provisioned.bookId,
      book: card,
    });
  }

  listTrash(): readonly BookshelfTrashEntry[] {
    return Object.freeze(this.books.listTrash()
      .map((book) => Object.freeze({
        bookId: book.bookId,
        title: book.title,
        storageState: "trashed" as const,
        trashedAt: book.trashedAt.toISOString(),
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

  moveBookToTrash(bookId: string): BookshelfTrashEntry {
    const entry = this.lifecycle.moveToTrash(bookId);
    return Object.freeze({
      bookId: entry.bookId,
      title: entry.title,
      storageState: "trashed",
      trashedAt: entry.trashedAt.toISOString(),
    });
  }

  restoreBookFromTrash(bookId: string): BookshelfBookCard {
    const book = this.lifecycle.restoreFromTrash(bookId);
    return this.catalog.read(book, this.books.listProjectIdsForBook(bookId));
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

  listProjectArchiveSummaries(bookId: string) {
    return this.projectArchives.listSummaries(bookId);
  }

  createProjectArchive(projectId: string) {
    return this.projectArchives.createForProjectDeletion(projectId);
  }

  restoreProjectArchive(request: RestoreProjectArchiveRequest) {
    return this.projectArchives.restore(request);
  }
}
