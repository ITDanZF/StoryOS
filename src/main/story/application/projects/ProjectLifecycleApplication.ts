import path from "node:path";
import type {
  CreateProjectRequest,
  RenameProjectRequest,
} from "../../../../shared/contracts/projects/projectContracts.ts";
import type { DesktopControllerDependencies } from "../../../desktop/DesktopControllerDependencies.ts";
export default class ProjectLifecycleApplication {
  constructor(
    private readonly dependencies: Pick<
      DesktopControllerDependencies,
      "runtime" | "projects" | "bookshelf"
    >,
    private readonly files: {
      openPath(path: string): Promise<string>;
      trashItem(path: string): Promise<void>;
    },
  ) {}
  async restoreProjectArchive(request: {
    readonly archiveId: string;
    readonly targetParentPath: string;
    readonly projectName: string;
    readonly bookStrategy: "snapshot" | "current";
  }) {
    const projectName = request.projectName.trim();
    if (
      !projectName ||
      projectName === "." ||
      projectName === ".." ||
      projectName.includes("/") ||
      projectName.includes("\\")
    ) {
      throw new Error("Project restore name must be a single folder name.");
    }
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const result = this.dependencies.bookshelf.restoreProjectArchive({
      archiveId: request.archiveId,
      targetPath: path.join(request.targetParentPath, projectName),
      bookStrategy: request.bookStrategy,
    });
    try {
      await this.dependencies.runtime.activate(result.projectPath);
      this.dependencies.projects.switchProject(result.projectPath);
      return Object.freeze({
        result,
        workspace: this.getWorkspaceSnapshot(),
      });
    } catch (error) {
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  getProjectSnapshot() {
    return this.dependencies.projects.getSnapshot();
  }

  getWorkspaceSnapshot() {
    return Object.freeze({
      projects: this.dependencies.projects.getSnapshot(),
      threads: this.dependencies.runtime.threads.getSnapshot(),
    });
  }

  async createProject(request: CreateProjectRequest) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const project = this.dependencies.projects.createProject(request);
    const bookId = request.bookId?.trim() || null;
    try {
      if (bookId) {
        await this.dependencies.bookshelf.attachBookToProject(project.id, bookId);
      }
      await this.dependencies.runtime.activate(project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      if (bookId) {
        try {
          await this.dependencies.bookshelf.detachBookFromProject(project.id);
          this.dependencies.projects.switchProject(previousPath);
          this.dependencies.projects.rollbackProjectCreation(project);
          await this.dependencies.runtime.activate(previousPath);
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            `Project creation recovery failed: ${project.id}`,
          );
        }
        throw error;
      }
      this.dependencies.projects.switchProject(previousPath);
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async openProject(projectPath: string) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const project = this.dependencies.projects.openProject(projectPath);
    try {
      await this.dependencies.runtime.activate(project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.switchProject(previousPath);
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async openProjectDirectory(projectPath: string): Promise<void> {
    const project = this.dependencies.projects.getProject(projectPath);
    const errorMessage = await this.files.openPath(project.path);
    if (errorMessage) throw new Error(`Could not open project directory: ${errorMessage}`);
  }

  async renameProject(request: RenameProjectRequest) {
    const wasActive =
      this.dependencies.projects.getSnapshot().activeProjectPath === request.projectPath;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(request.projectPath);
    const result = this.dependencies.projects.renameProject(request);
    try {
      if (wasActive) await this.dependencies.runtime.activate(result.project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.rollbackProjectRename(result);
      if (wasActive) await this.dependencies.runtime.activate(result.previousProject.path);
      throw error;
    }
  }

  async deleteProject(projectPath: string) {
    const project = this.dependencies.projects.getProject(projectPath);
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === project.path;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(project.path);
    try {
      await this.dependencies.bookshelf.createProjectArchive(project.id);
      await this.files.trashItem(project.path);
    } catch (error) {
      if (wasActive) await this.dependencies.runtime.activate(project.path);
      throw error;
    }
    const snapshot = this.dependencies.projects.removeProject(project.path);
    await this.dependencies.runtime.activate(snapshot.activeProjectPath);
    return this.getWorkspaceSnapshot();
  }

  async switchProject(projectPath: string | null) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    await this.dependencies.runtime.activate(projectPath);
    try {
      this.dependencies.projects.switchProject(projectPath);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async removeProject(projectPath: string) {
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === projectPath;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(projectPath);
    const snapshot = this.dependencies.projects.removeProject(projectPath);
    await this.dependencies.runtime.activate(snapshot.activeProjectPath);
    return this.getWorkspaceSnapshot();
  }
}
