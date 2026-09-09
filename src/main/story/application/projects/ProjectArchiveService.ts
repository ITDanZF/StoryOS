import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import type { BookRegistry } from "../books/bookRegistryPorts.ts";
import {
  getProjectArchiveCreationRoot,
  getPublishedProjectArchiveLayout,
} from "../../storage/archive/ProjectArchiveLayout.ts";
import type ProjectApplication from "./ProjectApplication.ts";
import {
  type ProjectArchiveDto,
  type ProjectArchiveManifest,
  type ProjectArchiveSummary,
} from "./projectArchiveContracts.ts";
import { toDto } from "./projectArchiveHelpers.ts";
import { validateProjectArchive } from "./ProjectArchivePackage.ts";
import type { ProjectArchiveStore } from "./projectArchivePorts.ts";
import ProjectArchivePublisher from "./ProjectArchivePublisher.ts";
import ProjectArchiveRecoveryService from "./ProjectArchiveRecoveryService.ts";
import ProjectArchiveRestorer from "./ProjectArchiveRestorer.ts";

export default class ProjectArchiveService {
  private readonly recovery: ProjectArchiveRecoveryService;

  constructor(
    private readonly agentHome: string,
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly archives: ProjectArchiveStore,
    private readonly bookRuntimes: BookRuntimeManager,
  ) {
    this.recovery = new ProjectArchiveRecoveryService(agentHome, projects, books, archives);
  }

  list(
    input: {
      readonly bookId?: string;
      readonly sourceProjectId?: string;
    } = {},
  ): readonly ProjectArchiveDto[] {
    return Object.freeze(this.archives.list(input).map(toDto));
  }

  listSummaries(bookId: string): readonly ProjectArchiveSummary[] {
    return Object.freeze(
      this.archives.list({ bookId }).map((record) => {
        let manifest: ProjectArchiveManifest | null = null;
        let state = record.state;
        if (record.state !== "creating") {
          try {
            const layout = getPublishedProjectArchiveLayout(this.agentHome, record.id);
            if (path.resolve(record.archivePath) !== layout.rootPath) {
              throw new Error(`Project archive path is invalid: ${record.archivePath}`);
            }
            const verified = validateProjectArchive(layout);
            if (
              verified.manifest.archiveId !== record.id ||
              verified.manifest.project.id !== record.sourceProjectId ||
              (verified.manifest.book?.sourceBookId ?? null) !== record.bookId ||
              verified.manifestHash !== record.manifestHash
            ) {
              throw new Error(`Project archive registration does not match: ${record.id}`);
            }
            manifest = verified.manifest;
          } catch {
            state = "corrupted";
          }
        }

        const strategies: Array<"snapshot" | "current"> = [];
        if (state === "available" && manifest?.book) {
          strategies.push("snapshot");
          const currentBook = this.books.getBookById(manifest.book.sourceBookId);
          if (
            currentBook?.state === "available" &&
            this.books.listProjectIdsForBook(currentBook.id).length === 0
          ) {
            try {
              if (this.bookRuntimes.inspectStorage(currentBook.id).state === "available") {
                strategies.push("current");
              }
            } catch {
              // A failed health inspection means the current-book strategy is unavailable.
            }
          }
        }

        return Object.freeze({
          archiveId: record.id,
          sourceProjectId: record.sourceProjectId,
          projectName: manifest?.project.name ?? null,
          originalProjectPath: manifest?.project.originalPath ?? null,
          bookId: record.bookId,
          state,
          containsBookSnapshot: record.bookId !== null,
          availableBookStrategies: Object.freeze(strategies),
          createdAt: record.createdAt.toISOString(),
          restoredAt: record.restoredAt?.toISOString() ?? null,
        });
      }),
    );
  }

  createForProjectDeletion(
    ...args: Parameters<ProjectArchivePublisher["createForProjectDeletion"]>
  ) {
    return new ProjectArchivePublisher(
      this.agentHome,
      this.projects,
      this.books,
      this.archives,
      this.bookRuntimes,
    ).createForProjectDeletion(...args);
  }

  restore(...args: Parameters<ProjectArchiveRestorer["restore"]>) {
    return new ProjectArchiveRestorer(
      this.agentHome,
      this.projects,
      this.books,
      this.archives,
      this.bookRuntimes,
    ).restore(...args);
  }

  reconcile(): readonly ProjectArchiveDto[] {
    this.recovery.recoverInterruptedRestores();
    const results: ProjectArchiveDto[] = [];
    for (const archive of this.archives.list()) {
      try {
        const layout = getPublishedProjectArchiveLayout(this.agentHome, archive.id);
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
          this.projects
            .getSnapshot()
            .projects.some(
              (project) => project.id === updated.sourceProjectId && !existsSync(project.path),
            )
        ) {
          const project = this.projects
            .getSnapshot()
            .projects.find((candidate) => candidate.id === updated.sourceProjectId);
          if (project) this.projects.removeProject(project.path);
        }
        results.push(toDto(updated));
      } catch {
        results.push(
          toDto(
            this.archives.updateState({
              archiveId: archive.id,
              state: "corrupted",
            }),
          ),
        );
      }
    }
    const creationRoot = getProjectArchiveCreationRoot(this.agentHome);
    if (existsSync(creationRoot)) {
      for (const archive of this.archives
        .list()
        .filter((candidate) => candidate.state !== "creating")) {
        rmSync(path.join(creationRoot, archive.id), {
          recursive: true,
          force: true,
        });
      }
    }
    return Object.freeze(results);
  }
}
