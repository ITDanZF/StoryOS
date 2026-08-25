import path from "node:path";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import type { BookRuntimeLease } from "../runtime/BookRuntimeManager.ts";
import BookDatabase from "../storage/book/BookDatabase.ts";
import {
  getBookCreationRoot,
  getBookLayout,
  getBookLibraryRoot,
} from "../storage/book/BookLayout.ts";
import SqliteNovelStore from "../storage/book/SqliteNovelStore.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";
import type { NovelRecord } from "./novelPorts.ts";

export type ProvisionedProjectBook = {
  readonly operationId: string;
  readonly bookId: string;
  readonly novel: NovelRecord;
  readonly lease: BookRuntimeLease;
};

export type BookProvisioningStage =
  | "preparing"
  | "database_created"
  | "published"
  | "registered"
  | "opened";

export type BookProvisioningFailureState =
  | "cleaned"
  | "cleanup_failed"
  | "registered_for_recovery";

export class BookProvisioningError extends Error {
  constructor(
    readonly operationId: string,
    readonly stage: BookProvisioningStage,
    readonly failureState: BookProvisioningFailureState,
    cause: unknown,
    readonly cleanupError?: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Book provisioning failed at ${stage}: ${reason}`, { cause });
    this.name = "BookProvisioningError";
  }
}

export default class BookProvisioningService {
  constructor(
    private readonly agentHome: string,
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
  ) {}

  createForProject(
    projectId: string,
    input: Omit<NovelRecord, "createdAt" | "updatedAt">,
  ): ProvisionedProjectBook {
    if (this.books.getBookForProject(projectId)) {
      throw new Error(`Project already has a book: ${projectId}`);
    }

    const operationId = `create_${crypto.randomUUID()}`;
    const bookId = `book_${crypto.randomUUID()}`;
    const creationRoot = getBookCreationRoot(this.agentHome);
    const temporaryRoot = path.resolve(creationRoot, operationId);
    if (path.dirname(temporaryRoot) !== creationRoot) {
      throw new Error(`Book creation path escapes its root: ${temporaryRoot}`);
    }
    const temporaryDatabasePath = path.join(temporaryRoot, "book.sqlite");
    const finalLayout = getBookLayout(this.agentHome, bookId);
    let stage: BookProvisioningStage = "preparing";
    let movedToFinalLocation = false;
    let registered = false;
    try {
      mkdirSync(creationRoot, { recursive: true });
      mkdirSync(temporaryRoot, { recursive: false });
      const database = new BookDatabase(temporaryDatabasePath);
      let novel: NovelRecord;
      try {
        novel = new SqliteNovelStore(database.handle).createNovel(input);
      } finally {
        database.close();
      }
      stage = "database_created";

      mkdirSync(getBookLibraryRoot(this.agentHome), { recursive: true });
      if (existsSync(finalLayout.rootPath)) {
        throw new Error(`Book storage path already exists: ${finalLayout.rootPath}`);
      }
      renameSync(temporaryRoot, finalLayout.rootPath);
      movedToFinalLocation = true;
      stage = "published";
      this.books.registerBookForProject({
        id: bookId,
        projectId,
        storagePath: finalLayout.rootPath,
      });
      registered = true;
      stage = "registered";
      const lease = this.runtimes.acquire(bookId);
      stage = "opened";
      return Object.freeze({
        operationId,
        bookId,
        novel,
        lease,
      });
    } catch (error) {
      if (registered) {
        throw new BookProvisioningError(
          operationId,
          stage,
          "registered_for_recovery",
          error,
        );
      }
      try {
        rmSync(
          movedToFinalLocation ? finalLayout.rootPath : temporaryRoot,
          { recursive: true, force: true },
        );
      } catch (cleanupError) {
        throw new BookProvisioningError(
          operationId,
          stage,
          "cleanup_failed",
          error,
          cleanupError,
        );
      }
      throw new BookProvisioningError(
        operationId,
        stage,
        "cleaned",
        error,
      );
    }
  }
}
