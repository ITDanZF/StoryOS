import {
  ownsOperationDirectory,
  removeOperationDirectory,
} from "../storage/common/operationOwnership.ts";
import path from "node:path";
import { existsSync, rmSync } from "node:fs";
import BookDatabase from "../storage/book/BookDatabase.ts";
import {
  getBookCreationRoot,
  getBookLayout,
} from "../storage/book/BookLayout.ts";
import {
  getProjectArchiveRestoreRoot,
  getPublishedProjectArchiveLayout,
} from "../storage/archive/ProjectArchiveLayout.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import { readProjectMetadata } from "../workspace/ProjectLayout.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";
import type {
  ProjectArchiveOperationRecord,
  ProjectArchiveRecord,
} from "./projectArchiveContracts.ts";
import type { ProjectArchiveStore } from "./projectArchivePorts.ts";
import type ProjectApplication from "./ProjectApplication.ts";
import { validateProjectArchive } from "./ProjectArchivePackage.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class ProjectArchiveRecoveryService {
  constructor(
    private readonly agentHome: string,
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly archives: ProjectArchiveStore,
  ) {}

  recoverInterruptedRestores(): void {
    for (const operation of this.archives.listIncompleteOperations()) {
      if (!/^project_restore_[0-9a-f-]{36}$/i.test(operation.id))
        throw new Error("Invalid restore operation identity.");
      const archive = this.archives.getById(operation.archiveId);
      try {
        if (!archive)
          throw new Error(`Project archive not found: ${operation.archiveId}`);
        const archiveLayout = getPublishedProjectArchiveLayout(
          this.agentHome,
          archive.id,
        );
        const verified = validateProjectArchive(archiveLayout);
        if (
          verified.manifest.archiveId !== archive.id ||
          verified.manifest.project.id !== archive.sourceProjectId ||
          (verified.manifest.book?.sourceBookId ?? null) !== archive.bookId
        ) {
          throw new Error(
            `Project archive registration mismatch: ${archive.id}`,
          );
        }
        if (!existsSync(operation.targetPath)) {
          this.cleanup(operation);
          this.archives.updateOperation({
            operationId: operation.id,
            state: "failed",
            errorMessage: "Restore was interrupted before project publication.",
          });
          continue;
        }
        if (!ownsOperationDirectory(operation.targetPath, operation.id))
          throw new Error("Restore target ownership mismatch.");
        const metadata = readProjectMetadata(operation.targetPath);
        if (!metadata || metadata.projectId !== verified.manifest.project.id) {
          throw new Error(
            "Interrupted restore project metadata does not match.",
          );
        }
        ProjectDatabase.validateExisting(
          path.join(operation.targetPath, ".storyos", "project.sqlite"),
        );
        const restoredBookLayout =
          operation.bookStrategy === "snapshot" && operation.restoredBookId
            ? getBookLayout(this.agentHome, operation.restoredBookId)
            : null;
        if (restoredBookLayout) {
          BookDatabase.validateExisting(restoredBookLayout.databasePath);
        }
        const existingProject = this.projects
          .getSnapshot()
          .projects.find(
            (candidate) => candidate.id === verified.manifest.project.id,
          );
        if (
          existingProject &&
          path.resolve(existingProject.path) !==
            path.resolve(operation.targetPath)
        ) {
          throw new Error(
            `Interrupted restore project id conflicts: ${existingProject.id}`,
          );
        }
        const project =
          existingProject ??
          this.projects.restoreProject({
            id: verified.manifest.project.id,
            path: operation.targetPath,
            name: verified.manifest.project.name,
            locationType: verified.manifest.project.locationType,
            trusted: verified.manifest.project.trusted,
            createdAt: new Date(verified.manifest.project.createdAt),
            updatedAt: new Date(verified.manifest.project.updatedAt),
            lastOpenedAt: new Date(verified.manifest.project.lastOpenedAt),
          });
        if (operation.restoredBookId) {
          const binding = this.books.getBookForProject(project.id);
          if (binding?.id !== operation.restoredBookId) {
            if (binding) {
              throw new Error(
                `Interrupted restore book binding conflicts: ${project.id}`,
              );
            }
            if (
              restoredBookLayout &&
              !this.books.getBookById(operation.restoredBookId)
            ) {
              this.books.registerBookForProject({
                id: operation.restoredBookId,
                projectId: project.id,
                storagePath: restoredBookLayout.rootPath,
              });
            } else {
              this.books.attachExistingBook({
                projectId: project.id,
                bookId: operation.restoredBookId,
              });
            }
          }
        }
        this.archives.updateOperation({
          operationId: operation.id,
          state: "registered",
        });
        this.archives.updateState({
          archiveId: archive.id,
          state: "restored",
          restoredAt: new Date(),
          manifestHash: verified.manifestHash,
        });
        this.archives.updateOperation({
          operationId: operation.id,
          state: "completed",
        });
        this.cleanup(operation, false);
      } catch (error) {
        this.compensate(operation, archive);
        try {
          this.archives.updateOperation({
            operationId: operation.id,
            state: "failed",
            errorMessage: errorMessage(error),
          });
        } catch {
          // Reconciliation will retry if the operation state could not be saved.
        }
      }
    }
  }

  private compensate(
    operation: ProjectArchiveOperationRecord,
    archive: ProjectArchiveRecord | null,
  ): void {
    if (
      existsSync(operation.targetPath) &&
      !ownsOperationDirectory(operation.targetPath, operation.id)
    )
      return;
    const project = archive
      ? this.projects
          .getSnapshot()
          .projects.find(
            (candidate) => candidate.id === archive.sourceProjectId,
          )
      : undefined;
    if (
      project &&
      path.resolve(project.path) === path.resolve(operation.targetPath)
    ) {
      const binding = this.books.getBookForProject(project.id);
      if (binding) {
        if (
          operation.bookStrategy === "snapshot" &&
          operation.restoredBookId === binding.id
        ) {
          try {
            this.books.rollbackRestoredBook({
              bookId: binding.id,
              projectId: project.id,
              storagePath: getBookLayout(this.agentHome, binding.id).rootPath,
            });
          } catch {
            return;
          }
        } else {
          this.books.detachBook(project.id);
        }
      }
      this.projects.removeProject(project.path);
    }
    this.cleanup(operation);
  }

  private cleanup(
    operation: ProjectArchiveOperationRecord,
    removePublished = true,
  ): void {
    rmSync(
      path.join(getProjectArchiveRestoreRoot(this.agentHome), operation.id),
      { recursive: true, force: true },
    );
    rmSync(path.join(getBookCreationRoot(this.agentHome), operation.id), {
      recursive: true,
      force: true,
    });
    if (!removePublished) return;
    removeOperationDirectory(operation.targetPath, operation.id);
    if (operation.bookStrategy === "snapshot" && operation.restoredBookId) {
      const registered = this.books.getBookById(operation.restoredBookId);
      if (!registered) {
        removeOperationDirectory(
          getBookLayout(this.agentHome, operation.restoredBookId).rootPath,
          operation.id,
        );
      }
    }
  }
}
