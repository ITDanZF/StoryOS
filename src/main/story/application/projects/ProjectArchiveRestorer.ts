import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import {
  markOperationDirectory,
  removeOperationDirectory,
} from "../../storage/common/operationOwnership.ts";
import ProjectDatabase from "../../storage/project/ProjectDatabase.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import type { BookRegistry } from "../books/bookRegistryPorts.ts";
import BookDatabase from "../../storage/book/BookDatabase.ts";
import {
  getBookCreationRoot,
  getBookLayout,
  getBookLibraryRoot,
} from "../../storage/book/BookLayout.ts";
import {
  getProjectArchiveRestoreRoot,
  getProjectArchivesRoot,
  getPublishedProjectArchiveLayout,
} from "../../storage/archive/ProjectArchiveLayout.ts";
import { readProjectMetadata } from "../../workspace/ProjectLayout.ts";
import type ProjectApplication from "./ProjectApplication.ts";
import {
  type RestoreProjectArchiveRequest,
  type RestoreProjectArchiveResult,
} from "./projectArchiveContracts.ts";
import { isPathInside, requireAbsolutePath, toDto } from "./projectArchiveHelpers.ts";
import { copyProjectDirectory, validateProjectArchive } from "./ProjectArchivePackage.ts";
import type { ProjectArchiveStore } from "./projectArchivePorts.ts";

export default class ProjectArchiveRestorer {
  constructor(
    private readonly agentHome: string,
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly archives: ProjectArchiveStore,
    private readonly bookRuntimes: BookRuntimeManager,
  ) {}
  restore(request: RestoreProjectArchiveRequest): RestoreProjectArchiveResult {
    if (!(["snapshot", "current"] as const).includes(request.bookStrategy)) {
      throw new Error(`Invalid project restore book strategy: ${request.bookStrategy}`);
    }
    const archiveId = request.archiveId.trim();
    const record = this.archives.getById(archiveId);
    if (!record) throw new Error(`Project archive not found: ${archiveId}`);
    if (record.state !== "available") {
      throw new Error(`Project archive is not available: ${archiveId}`);
    }
    const registeredLayout = getPublishedProjectArchiveLayout(this.agentHome, archiveId);
    if (path.resolve(record.archivePath) !== registeredLayout.rootPath) {
      throw new Error(`Project archive path is invalid: ${record.archivePath}`);
    }
    const verified = validateProjectArchive(registeredLayout);
    if (
      verified.manifest.archiveId !== record.id ||
      verified.manifest.project.id !== record.sourceProjectId ||
      (verified.manifest.book?.sourceBookId ?? null) !== record.bookId ||
      verified.manifestHash !== record.manifestHash
    ) {
      throw new Error(`Project archive registration does not match: ${archiveId}`);
    }
    const targetPath = requireAbsolutePath(request.targetPath, "Project restore path");
    if (
      isPathInside(getProjectArchivesRoot(this.agentHome), targetPath) ||
      isPathInside(path.resolve(this.agentHome, "library"), targetPath)
    ) {
      throw new Error("Project restore path cannot be inside StoryOS archive or library storage.");
    }
    if (existsSync(targetPath)) {
      throw new Error(`Project restore path already exists: ${targetPath}`);
    }
    const targetParent = path.dirname(targetPath);
    if (!existsSync(targetParent) || !statSync(targetParent).isDirectory()) {
      throw new Error(`Project restore parent does not exist: ${targetParent}`);
    }
    if (
      this.projects.getSnapshot().projects.some((project) => project.id === record.sourceProjectId)
    ) {
      throw new Error(`Project id already exists: ${record.sourceProjectId}`);
    }
    if (request.bookStrategy === "current" && verified.manifest.book) {
      const currentBook = this.books.getBookById(verified.manifest.book.sourceBookId);
      if (!currentBook || currentBook.state !== "available") {
        throw new Error(`Current bookshelf book is unavailable: ${record.bookId}`);
      }
      if (this.books.listProjectIdsForBook(currentBook.id).length > 0) {
        throw new Error(`Current bookshelf book is already attached: ${currentBook.id}`);
      }
      const lease = this.bookRuntimes.acquire(currentBook.id);
      lease.close();
    }

    const operationId = `project_restore_${crypto.randomUUID()}`;
    const restoreRoot = getProjectArchiveRestoreRoot(this.agentHome);
    const temporaryProjectPath = path.join(restoreRoot, operationId, "project");
    const bookId = verified.manifest.book
      ? request.bookStrategy === "snapshot"
        ? `book_${crypto.randomUUID()}`
        : verified.manifest.book.sourceBookId
      : null;
    const temporaryBookRoot = path.join(getBookCreationRoot(this.agentHome), operationId);
    const restoredBookLayout =
      bookId && request.bookStrategy === "snapshot" ? getBookLayout(this.agentHome, bookId) : null;
    this.archives.beginRestore({
      id: operationId,
      archiveId,
      targetPath,
      bookStrategy: request.bookStrategy,
      restoredBookId: bookId,
    });
    let projectPublished = false;
    let projectRegistered = false;
    let bookPublished = false;
    let bookRegistered = false;
    try {
      mkdirSync(path.dirname(temporaryProjectPath), { recursive: true });
      copyProjectDirectory(registeredLayout.projectPath, temporaryProjectPath);
      markOperationDirectory(temporaryProjectPath, operationId);
      const metadata = readProjectMetadata(temporaryProjectPath);
      if (!metadata || metadata.projectId !== verified.manifest.project.id) {
        throw new Error("Restored project metadata does not match its archive.");
      }
      ProjectDatabase.validateExisting(
        path.join(temporaryProjectPath, ".storyos", "project.sqlite"),
      );
      if (restoredBookLayout) {
        mkdirSync(temporaryBookRoot, { recursive: true });
        const temporaryDatabasePath = path.join(temporaryBookRoot, "book.sqlite");
        copyFileSync(registeredLayout.bookSnapshotPath, temporaryDatabasePath);
        BookDatabase.validateExisting(temporaryDatabasePath);
        if (!bookId) throw new Error("Restored book identity is missing.");
        BookDatabase.identifyCopy(temporaryDatabasePath, bookId);
        markOperationDirectory(temporaryBookRoot, operationId);
        mkdirSync(getBookLibraryRoot(this.agentHome), { recursive: true });
        if (existsSync(restoredBookLayout.rootPath)) {
          throw new Error(`Restored book path already exists: ${restoredBookLayout.rootPath}`);
        }
        renameSync(temporaryBookRoot, restoredBookLayout.rootPath);
        bookPublished = true;
      }
      renameSync(temporaryProjectPath, targetPath);
      projectPublished = true;
      this.archives.updateOperation({
        operationId,
        state: "files_published",
      });
      const project = this.projects.restoreProject({
        id: verified.manifest.project.id,
        path: targetPath,
        name: verified.manifest.project.name,
        locationType: verified.manifest.project.locationType,
        trusted: verified.manifest.project.trusted,
        createdAt: new Date(verified.manifest.project.createdAt),
        updatedAt: new Date(verified.manifest.project.updatedAt),
        lastOpenedAt: new Date(verified.manifest.project.lastOpenedAt),
      });
      projectRegistered = true;
      if (restoredBookLayout && bookId) {
        this.books.registerBookForProject({
          id: bookId,
          projectId: project.id,
          storagePath: restoredBookLayout.rootPath,
        });
        bookRegistered = true;
      } else if (bookId) {
        this.books.attachExistingBook({ projectId: project.id, bookId });
        bookRegistered = true;
      }
      this.archives.updateOperation({ operationId, state: "registered" });
      const completed = this.archives.updateState({
        archiveId,
        state: "restored",
        restoredAt: new Date(),
      });
      this.archives.updateOperation({ operationId, state: "completed" });
      return Object.freeze({
        archive: toDto(completed),
        projectId: project.id,
        projectPath: project.path,
        bookId,
        bookStrategy: request.bookStrategy,
      });
    } catch (error) {
      if (bookRegistered && bookId) {
        if (restoredBookLayout) {
          try {
            this.books.rollbackRestoredBook({
              bookId,
              projectId: verified.manifest.project.id,
              storagePath: restoredBookLayout.rootPath,
            });
          } catch {
            // Preserve the original restore failure.
          }
        } else {
          try {
            this.books.detachBook(verified.manifest.project.id);
          } catch {
            // Preserve the original restore failure.
          }
        }
      }
      if (projectRegistered) {
        try {
          this.projects.removeProject(targetPath);
        } catch {
          // Preserve the original restore failure.
        }
      }
      if (projectPublished) removeOperationDirectory(targetPath, operationId);
      if (bookPublished && restoredBookLayout) {
        removeOperationDirectory(restoredBookLayout.rootPath, operationId);
      }
      try {
        this.archives.updateOperation({
          operationId,
          state: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Preserve the original restore failure.
      }
      throw error;
    } finally {
      rmSync(path.join(restoreRoot, operationId), {
        recursive: true,
        force: true,
      });
      rmSync(temporaryBookRoot, { recursive: true, force: true });
    }
  }
}
