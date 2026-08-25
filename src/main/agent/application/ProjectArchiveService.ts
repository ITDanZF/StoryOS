import path from "node:path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import BookDatabase from "../storage/book/BookDatabase.ts";
import {
  getBookCreationRoot,
  getBookLayout,
  getBookLibraryRoot,
} from "../storage/book/BookLayout.ts";
import {
  getProjectArchiveCreationRoot,
  getProjectArchiveLayout,
  getProjectArchiveRestoreRoot,
  getProjectArchivesRoot,
  getPublishedProjectArchiveLayout,
} from "../storage/archive/ProjectArchiveLayout.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import {
  readProjectMetadata,
} from "../workspace/ProjectLayout.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";
import {
  PROJECT_ARCHIVE_FORMAT_VERSION,
  type ProjectArchiveDto,
  type ProjectArchiveManifest,
  type ProjectArchiveRecord,
  type RestoreProjectArchiveRequest,
  type RestoreProjectArchiveResult,
} from "./projectArchiveContracts.ts";
import type { ProjectArchiveStore } from "./projectArchivePorts.ts";
import type ProjectApplication from "./ProjectApplication.ts";
import ProjectArchiveRecoveryService from "./ProjectArchiveRecoveryService.ts";
import {
  copyProjectDirectory,
  sealProjectArchive,
  validateProjectArchive,
} from "./ProjectArchivePackage.ts";

const APPLICATION_VERSION = "1.0.0";

function toDto(record: ProjectArchiveRecord): ProjectArchiveDto {
  return Object.freeze({
    ...record,
    createdAt: record.createdAt.toISOString(),
    restoredAt: record.restoredAt?.toISOString() ?? null,
  });
}

function requireAbsolutePath(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !path.isAbsolute(normalized)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return path.resolve(normalized);
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export default class ProjectArchiveService {
  private readonly recovery: ProjectArchiveRecoveryService;

  constructor(
    private readonly agentHome: string,
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly archives: ProjectArchiveStore,
    private readonly bookRuntimes: BookRuntimeManager,
  ) {
    this.recovery = new ProjectArchiveRecoveryService(
      agentHome,
      projects,
      books,
      archives,
    );
  }

  list(input: {
    readonly bookId?: string;
    readonly sourceProjectId?: string;
  } = {}): readonly ProjectArchiveDto[] {
    return Object.freeze(this.archives.list(input).map(toDto));
  }

  async createForProjectDeletion(projectId: string): Promise<ProjectArchiveDto> {
    const project = this.projects.getSnapshot().projects.find(
      (candidate) => candidate.id === projectId,
    );
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (!existsSync(project.path) || !statSync(project.path).isDirectory()) {
      throw new Error(`Project path does not exist: ${project.path}`);
    }
    const metadata = readProjectMetadata(project.path);
    if (!metadata || metadata.projectId !== project.id) {
      throw new Error(`Project metadata does not match: ${project.path}`);
    }
    const book = this.books.getBookForProject(project.id);
    if (book && book.state !== "available") {
      throw new Error(`Project book is unavailable: ${book.id}`);
    }

    const archiveId = `archive_${crypto.randomUUID()}`;
    const createdAt = new Date();
    const publishedLayout = getPublishedProjectArchiveLayout(
      this.agentHome,
      archiveId,
    );
    const creationRoot = getProjectArchiveCreationRoot(this.agentHome);
    const temporaryLayout = getProjectArchiveLayout(
      path.join(creationRoot, archiveId),
    );
    mkdirSync(creationRoot, { recursive: true });
    mkdirSync(temporaryLayout.rootPath, { recursive: false });
    let record: ProjectArchiveRecord;
    try {
      record = this.archives.create({
        id: archiveId,
        sourceProjectId: project.id,
        bookId: book?.id ?? null,
        archivePath: publishedLayout.rootPath,
        formatVersion: PROJECT_ARCHIVE_FORMAT_VERSION,
        createdAt,
      });
    } catch (error) {
      rmSync(temporaryLayout.rootPath, { recursive: true, force: true });
      throw error;
    }
    try {
      copyProjectDirectory(project.path, temporaryLayout.projectPath);
      if (book) {
        mkdirSync(path.dirname(temporaryLayout.bookSnapshotPath), {
          recursive: true,
        });
        await this.bookRuntimes.backupBook(
          book.id,
          temporaryLayout.bookSnapshotPath,
        );
      }
      const manifest: ProjectArchiveManifest = Object.freeze({
        format: "storyos-project-archive",
        formatVersion: PROJECT_ARCHIVE_FORMAT_VERSION,
        archiveId,
        createdAt: createdAt.toISOString(),
        applicationVersion: APPLICATION_VERSION,
        project: Object.freeze({
          id: project.id,
          name: project.name,
          originalPath: project.path,
          locationType: project.locationType,
          trusted: project.trusted,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          lastOpenedAt: project.lastOpenedAt,
        }),
        book: book
          ? Object.freeze({
              sourceBookId: book.id,
              snapshotPath: "book-snapshot/book.sqlite" as const,
            })
          : null,
      });
      sealProjectArchive(temporaryLayout, manifest);
      const verified = validateProjectArchive(temporaryLayout);
      mkdirSync(getProjectArchivesRoot(this.agentHome), { recursive: true });
      if (existsSync(publishedLayout.rootPath)) {
        throw new Error(`Project archive path already exists: ${publishedLayout.rootPath}`);
      }
      renameSync(temporaryLayout.rootPath, publishedLayout.rootPath);
      const published = validateProjectArchive(publishedLayout);
      if (published.manifestHash !== verified.manifestHash) {
        throw new Error(`Project archive changed during publication: ${archiveId}`);
      }
      return toDto(this.archives.updateState({
        archiveId: record.id,
        state: "available",
        manifestHash: published.manifestHash,
      }));
    } catch (error) {
      if (!existsSync(publishedLayout.rootPath)) {
        try {
          this.archives.updateState({ archiveId, state: "corrupted" });
        } catch {
          // Preserve the original archive failure.
        }
      }
      throw error;
    } finally {
      rmSync(temporaryLayout.rootPath, { recursive: true, force: true });
    }
  }

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
    const registeredLayout = getPublishedProjectArchiveLayout(
      this.agentHome,
      archiveId,
    );
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
    if (this.projects.getSnapshot().projects.some(
      (project) => project.id === record.sourceProjectId,
    )) {
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
    const restoredBookLayout = bookId && request.bookStrategy === "snapshot"
      ? getBookLayout(this.agentHome, bookId)
      : null;
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
      if (projectPublished) rmSync(targetPath, { recursive: true, force: true });
      if (bookPublished && restoredBookLayout) {
        rmSync(restoredBookLayout.rootPath, { recursive: true, force: true });
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
      rmSync(path.join(restoreRoot, operationId), { recursive: true, force: true });
      rmSync(temporaryBookRoot, { recursive: true, force: true });
    }
  }

  reconcile(): readonly ProjectArchiveDto[] {
    this.recovery.recoverInterruptedRestores();
    const results: ProjectArchiveDto[] = [];
    for (const archive of this.archives.list()) {
      try {
        const layout = getPublishedProjectArchiveLayout(
          this.agentHome,
          archive.id,
        );
        const verified = validateProjectArchive(layout);
        if (
          verified.manifest.archiveId !== archive.id ||
          verified.manifest.project.id !== archive.sourceProjectId ||
          (verified.manifest.book?.sourceBookId ?? null) !== archive.bookId
        ) {
          throw new Error(`Project archive registration mismatch: ${archive.id}`);
        }
        const state = archive.state === "creating" ? "available" : archive.state;
        const updated = this.archives.updateState({
          archiveId: archive.id,
          state,
          manifestHash: verified.manifestHash,
        });
        if (
          updated.state === "available" &&
          this.projects.getSnapshot().projects.some(
            (project) => project.id === updated.sourceProjectId && !existsSync(project.path),
          )
        ) {
          const project = this.projects.getSnapshot().projects.find(
            (candidate) => candidate.id === updated.sourceProjectId,
          );
          if (project) this.projects.removeProject(project.path);
        }
        results.push(toDto(updated));
      } catch {
        results.push(toDto(this.archives.updateState({
          archiveId: archive.id,
          state: "corrupted",
        })));
      }
    }
    const creationRoot = getProjectArchiveCreationRoot(this.agentHome);
    if (existsSync(creationRoot)) {
      for (const archive of this.archives.list().filter(
        (candidate) => candidate.state !== "creating",
      )) {
        rmSync(path.join(creationRoot, archive.id), { recursive: true, force: true });
      }
    }
    return Object.freeze(results);
  }

}
