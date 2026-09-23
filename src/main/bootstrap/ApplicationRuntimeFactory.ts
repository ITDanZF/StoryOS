import DesktopController from "../desktop/DesktopController.ts";
import ElectronPdfRenderer from "../desktop/ElectronPdfRenderer.ts";
import ResourceScope from "./ResourceScope.ts";
import ApplicationDatabase from "../story/storage/global/ApplicationDatabase.ts";
import BookCatalogProjection from "../story/storage/global/BookCatalogProjection.ts";
import SqliteBookReadingStateStore from "../story/storage/global/SqliteBookReadingStateStore.ts";
import SqliteBookStore from "../story/storage/global/SqliteBookStore.ts";
import SqliteProjectArchiveStore from "../story/storage/global/SqliteProjectArchiveStore.ts";
import SqliteProjectStore from "../story/storage/global/SqliteProjectStore.ts";
import { type ModelConnectionConfiguration } from "../agent/model/ModelConfiguration.ts";
import BookLifecycleService from "../story/application/books/BookLifecycleService.ts";
import BookProvisioningService from "../story/application/books/BookProvisioningService.ts";
import BookReaderApplication from "../story/application/books/BookReaderApplication.ts";
import BookRegistryReconciler from "../story/application/books/BookRegistryReconciler.ts";
import BookshelfApplication from "../story/application/books/BookshelfApplication.ts";
import ProjectApplication from "../story/application/projects/ProjectApplication.ts";
import ProjectArchiveService from "../story/application/projects/ProjectArchiveService.ts";
import ProjectBookBindingService from "../story/application/projects/ProjectBookBindingService.ts";
import ProjectNavigationReader from "../story/application/projects/ProjectNavigationReader.ts";
import BookFormatRegistry from "../story/application/transfers/BookFormatRegistry.ts";
import BookTransferService from "../story/application/transfers/BookTransferService.ts";
import BookRuntimeManager from "../story/runtime/BookRuntimeManager.ts";
import WorkspaceRuntimeManager from "../story/runtime/WorkspaceRuntimeManager.ts";
import type { AliyunTextEmbeddingClient } from "../agent/embedding/aliyun/types.ts";
import NovelVectorIndexCoordinator from "../story/application/vectors/NovelVectorIndexCoordinator.ts";
import NovelVectorPassageQuery from "../story/application/vectors/NovelVectorPassageQuery.ts";
import type { ApplicationHostOptions } from "./ApplicationHostOptions.ts";
export default class ApplicationRuntimeFactory {
  constructor(private readonly options: ApplicationHostOptions) {}
  async create(
    modelConfiguration: ModelConnectionConfiguration,
    embedding: { getClient(): AliyunTextEmbeddingClient | null },
  ) {
    const scope = new ResourceScope();
    const applicationDatabase = new ApplicationDatabase(this.options.agentHome);
    scope.add("application database", () => applicationDatabase.close());
    try {
      const projects = new ProjectApplication(new SqliteProjectStore(applicationDatabase.handle));
      const books = new SqliteBookStore(applicationDatabase.handle);
      const bookRuntimes = new BookRuntimeManager(
        this.options.agentHome,
        books,
        new BookCatalogProjection(applicationDatabase.handle),
      );
      scope.add("book runtimes", () => bookRuntimes.closeAll());
      const bookProvisioning = new BookProvisioningService(
        this.options.agentHome,
        books,
        bookRuntimes,
      );
      const bookReconciler = new BookRegistryReconciler(books, bookRuntimes);
      bookReconciler.reconcile();
      const novelVectorIndex = new NovelVectorIndexCoordinator(
        embedding.getClient,
        (bookId) => books.getBookById(bookId),
        () => bookRuntimes.listOpenBookIds(),
      );
      bookRuntimes.setOpenedListener((bookId) => novelVectorIndex.enqueue(bookId));
      // Repair projections after a crash between independent book/app commits.
      for (const book of books.listBooks()) {
        if (book.state !== "available") continue;
        const lease = bookRuntimes.acquire(book.id);
        lease.close();
      }
      const projectArchives = new ProjectArchiveService(
        this.options.agentHome,
        projects,
        books,
        new SqliteProjectArchiveStore(applicationDatabase.handle),
        bookRuntimes,
      );
      projectArchives.reconcile();
      const runtime = await WorkspaceRuntimeManager.create(
        projects,
        books,
        bookRuntimes,
        bookProvisioning,
        modelConfiguration,
        this.options.rendererEditorTools,
        {
          onRevisionSaved: (bookId) => novelVectorIndex.enqueue(bookId),
          passages: new NovelVectorPassageQuery(
            (bookId) => books.getBookById(bookId),
            () => embedding.getClient(),
          ),
        },
      );
      scope.add("workspace runtimes", () => runtime.shutdown());
      const bookBindings = new ProjectBookBindingService(projects, books, bookRuntimes, runtime);
      const bookLifecycle = new BookLifecycleService(this.options.agentHome, books, bookRuntimes);
      bookLifecycle.recoverPendingCleanups();
      const bookTransfer = new BookTransferService(
        this.options.agentHome,
        books,
        bookRuntimes,
        new BookFormatRegistry(new ElectronPdfRenderer()),
      );
      scope.add("book transfers", () => bookTransfer.dispose());
      const bookshelf = new BookshelfApplication(
        books,
        bookRuntimes,
        bookBindings,
        bookReconciler,
        bookLifecycle,
        bookTransfer,
        projectArchives,
        bookProvisioning,
      );
      const controller = new DesktopController({
        projects,
        runtime,
        projectNavigation: new ProjectNavigationReader(projects, books, bookRuntimes),
        bookshelf,
        novelVectorIndex,
      });
      const bookReader = new BookReaderApplication(
        bookRuntimes,
        new SqliteBookReadingStateStore(applicationDatabase.handle),
      );
      scope.add("book readers", () => bookReader.dispose());
      return { applicationDatabase, controller, bookReader, scope, bookTransfer, novelVectorIndex };
    } catch (error) {
      try {
        await scope.close();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Application initialization and cleanup failed");
      }
      throw error;
    }
  }
}
