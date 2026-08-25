import path from "node:path";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import type WorkspaceRuntimeManager from "../runtime/WorkspaceRuntimeManager.ts";
import type ProjectApplication from "./ProjectApplication.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";

type ProjectRuntimeBindingCoordinator = Pick<
  WorkspaceRuntimeManager,
  "activeProjectPath" | "closeForProjectMutation" | "activate"
>;

function samePath(first: string | null, second: string): boolean {
  if (first === null) return false;
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export default class ProjectBookBindingService {
  constructor(
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly bookRuntimes: BookRuntimeManager,
    private readonly projectRuntimes: ProjectRuntimeBindingCoordinator,
  ) {}

  async attachExistingBook(projectId: string, bookId: string): Promise<void> {
    const project = this.requireProject(projectId);
    const current = this.books.getBookForProject(project.id);
    if (current?.id === bookId) return;
    if (current) throw new Error(`Project already has a book: ${project.id}`);
    const writableProjectIds = this.books.listProjectIdsForBook(bookId)
      .filter((candidate) => candidate !== project.id);
    if (writableProjectIds.length > 0) {
      throw new Error(`Book is already attached to a writable project: ${bookId}`);
    }

    const healthCheck = this.bookRuntimes.acquire(bookId);
    healthCheck.close();
    const rebuildRuntime = samePath(
      this.projectRuntimes.activeProjectPath,
      project.path,
    );
    if (rebuildRuntime) {
      await this.projectRuntimes.closeForProjectMutation(project.path);
    }

    let attached = false;
    try {
      this.books.attachExistingBook({ projectId: project.id, bookId });
      attached = true;
      if (rebuildRuntime) await this.projectRuntimes.activate(project.path);
    } catch (error) {
      if (attached) this.books.detachBook(project.id);
      if (rebuildRuntime) {
        try {
          await this.projectRuntimes.activate(project.path);
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            `Book attachment recovery failed: ${bookId}`,
          );
        }
      }
      throw error;
    }
  }

  async detachBook(projectId: string): Promise<void> {
    const project = this.requireProject(projectId);
    const current = this.books.getBookForProject(project.id);
    if (!current) return;
    const rebuildRuntime = samePath(
      this.projectRuntimes.activeProjectPath,
      project.path,
    );
    if (rebuildRuntime) {
      await this.projectRuntimes.closeForProjectMutation(project.path);
    }

    let detached = false;
    try {
      this.books.detachBook(project.id);
      detached = true;
      if (rebuildRuntime) await this.projectRuntimes.activate(project.path);
    } catch (error) {
      if (detached) {
        this.books.attachExistingBook({
          projectId: project.id,
          bookId: current.id,
        });
      }
      if (rebuildRuntime) {
        try {
          await this.projectRuntimes.activate(project.path);
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            `Book detachment recovery failed: ${current.id}`,
          );
        }
      }
      throw error;
    }
  }

  private requireProject(projectId: string) {
    const project = this.projects.getSnapshot().projects.find(
      (candidate) => candidate.id === projectId,
    );
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return project;
  }
}
