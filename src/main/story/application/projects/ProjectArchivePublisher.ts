import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { APP_VERSION } from "../../../../shared/appInfo.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import type { BookRegistry } from "../books/bookRegistryPorts.ts";
import {
  getProjectArchiveCreationRoot,
  getProjectArchiveLayout,
  getProjectArchivesRoot,
  getPublishedProjectArchiveLayout,
} from "../../storage/archive/ProjectArchiveLayout.ts";
import { readProjectMetadata } from "../../workspace/ProjectLayout.ts";
import type ProjectApplication from "./ProjectApplication.ts";
import {
  PROJECT_ARCHIVE_FORMAT_VERSION,
  type ProjectArchiveDto,
  type ProjectArchiveManifest,
  type ProjectArchiveRecord,
} from "./projectArchiveContracts.ts";
import { toDto } from "./projectArchiveHelpers.ts";
import {
  copyProjectDirectory,
  sealProjectArchive,
  validateProjectArchive,
} from "./ProjectArchivePackage.ts";
import type { ProjectArchiveStore } from "./projectArchivePorts.ts";

export default class ProjectArchivePublisher {
  constructor(
    private readonly agentHome: string,
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly archives: ProjectArchiveStore,
    private readonly bookRuntimes: BookRuntimeManager,
  ) {}
  async createForProjectDeletion(projectId: string): Promise<ProjectArchiveDto> {
    const project = this.projects
      .getSnapshot()
      .projects.find((candidate) => candidate.id === projectId);
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
    const publishedLayout = getPublishedProjectArchiveLayout(this.agentHome, archiveId);
    const creationRoot = getProjectArchiveCreationRoot(this.agentHome);
    const temporaryLayout = getProjectArchiveLayout(path.join(creationRoot, archiveId));
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
        await this.bookRuntimes.backupBook(book.id, temporaryLayout.bookSnapshotPath);
      }
      const manifest: ProjectArchiveManifest = Object.freeze({
        format: "storyos-project-archive",
        formatVersion: PROJECT_ARCHIVE_FORMAT_VERSION,
        archiveId,
        createdAt: createdAt.toISOString(),
        applicationVersion: APP_VERSION,
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
      return toDto(
        this.archives.updateState({
          archiveId: record.id,
          state: "available",
          manifestHash: published.manifestHash,
        }),
      );
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
}
