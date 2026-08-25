import path from "node:path";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { CreateProjectRequest, ProjectDto, ProjectSnapshot, RenameProjectRequest } from "./projectContracts.ts";
import type { ProjectRecord, ProjectStore } from "./projectPorts.ts";
import {
  ensureSystemWorkspace,
  ensureWorkspaceLayout,
  getDefaultProjectsRoot,
  readProjectMetadata,
} from "../workspace/ProjectLayout.ts";

function toProjectDto(project: ProjectRecord): ProjectDto {
  return Object.freeze({
    id: project.id,
    path: project.path,
    name: project.name,
    locationType: project.locationType,
    trusted: project.trusted,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    lastOpenedAt: project.lastOpenedAt.toISOString(),
  });
}

function slugifyProjectName(name: string): string {
  const withoutControlCharacters = Array.from(name.trim(), (character) =>
    character.charCodeAt(0) < 32 ? "-" : character).join("");
  const slug = withoutControlCharacters
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/^\.+|[. ]+$/g, "");
  if (!slug) return "untitled-project";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(slug) ? `project-${slug}` : slug;
}

function pathsReferToSameLocation(firstPath: string, secondPath: string): boolean {
  const first = path.resolve(firstPath);
  const second = path.resolve(secondPath);
  return process.platform === "win32" ? first.toLowerCase() === second.toLowerCase() : first === second;
}

export type ProjectRenameResult = {
  readonly previousProject: ProjectDto;
  readonly project: ProjectDto;
};

export default class ProjectApplication {
  private activeProjectId: string | null;
  private readonly systemWorkspace = ensureSystemWorkspace();

  constructor(private readonly store: ProjectStore) {
    this.activeProjectId = store.getActiveProjectId();
  }

  getActiveProjectPath(): string | null {
    return this.activeProjectId ? this.store.getProjectById(this.activeProjectId)?.path ?? null : null;
  }

  getSnapshot(): ProjectSnapshot {
    const activeProject = this.activeProjectId ? this.store.getProjectById(this.activeProjectId) : null;
    return Object.freeze({
      activeProjectId: activeProject?.id ?? null,
      activeProjectPath: activeProject?.path ?? null,
      activeProject: activeProject ? toProjectDto(activeProject) : null,
      projects: Object.freeze(this.store.listProjects().map(toProjectDto)),
      creationDefaults: Object.freeze({ parentPath: path.resolve(this.getDefaultParentPath()) }),
      systemWorkspace: Object.freeze({
        id: "system-default" as const,
        name: "无项目对话" as const,
        path: this.systemWorkspace.rootPath,
      }),
    });
  }

  createProject(request: CreateProjectRequest): ProjectDto {
    const name = this.requireName(request.name);
    const parentPath = path.resolve(request.parentPath?.trim() || this.getDefaultParentPath());
    this.requireParentDirectory(parentPath);
    const projectPath = this.nextAvailableProjectPath(parentPath, slugifyProjectName(name));
    mkdirSync(projectPath);

    try {
      const projectId = `prj_${crypto.randomUUID()}`;
      ensureWorkspaceLayout({ rootPath: projectPath, projectId, name, locationType: "created" });
      if (request.createAgentsFile) {
        const agentsPath = path.join(projectPath, "AGENTS.md");
        if (!existsSync(agentsPath)) {
          writeFileSync(agentsPath, "# Project Instructions\n\nDescribe project goals, coding style, constraints, and context here.\n", "utf-8");
        }
      }
      const project = this.store.upsertProject({
        id: projectId,
        path: projectPath,
        name,
        locationType: "created",
        trusted: true,
      });
      this.setActiveProject(project.id);
      return toProjectDto(project);
    } catch (error) {
      rmSync(projectPath, { recursive: true, force: true });
      throw error;
    }
  }

  rollbackProjectCreation(project: ProjectDto): void {
    const registered = this.store.getProjectById(project.id);
    if (!registered || !pathsReferToSameLocation(registered.path, project.path)) {
      throw new Error(`Created project is no longer registered: ${project.id}`);
    }
    const metadata = readProjectMetadata(project.path);
    if (!metadata || metadata.projectId !== project.id) {
      throw new Error(`Created project metadata does not match: ${project.path}`);
    }
    if (registered.locationType !== "created") {
      throw new Error(`Linked projects cannot be rolled back: ${project.id}`);
    }
    this.store.removeProject(project.path);
    if (this.activeProjectId === project.id) this.setActiveProject(null);
    rmSync(project.path, { recursive: true, force: true });
  }

  openProject(projectPath: string): ProjectDto {
    const normalizedPath = path.resolve(this.requirePath(projectPath));
    if (!existsSync(normalizedPath)) throw new Error(`Project path does not exist: ${normalizedPath}`);
    if (!statSync(normalizedPath).isDirectory()) throw new Error(`Project path is not a directory: ${normalizedPath}`);

    const existingMetadata = readProjectMetadata(normalizedPath);
    if (existingMetadata?.locationType === "system-default") {
      throw new Error("The StoryOS system workspace cannot be opened as a user project.");
    }
    const projectId = existingMetadata?.projectId ?? `prj_${crypto.randomUUID()}`;
    const fallbackName = path.basename(normalizedPath) || normalizedPath;
    const name = existingMetadata?.name ?? fallbackName;
    const locationType = existingMetadata?.locationType === "created" ? "created" : "linked";
    ensureWorkspaceLayout({ rootPath: normalizedPath, projectId, name, locationType });
    const project = this.store.upsertProject({
      id: projectId,
      path: normalizedPath,
      name,
      locationType,
      trusted: true,
    });
    this.setActiveProject(project.id);
    return toProjectDto(project);
  }

  getProject(projectPath: string): ProjectDto {
    const normalizedPath = path.resolve(this.requirePath(projectPath));
    const project = this.store.getProject(normalizedPath);
    if (!project) throw new Error(`Project not found: ${normalizedPath}`);
    if (!existsSync(project.path)) throw new Error(`Project path does not exist: ${project.path}`);
    if (!statSync(project.path).isDirectory()) throw new Error(`Project path is not a directory: ${project.path}`);
    return toProjectDto(project);
  }

  renameProject(request: RenameProjectRequest): ProjectRenameResult {
    const previousProject = this.getProject(request.projectPath);
    const name = this.requireName(request.name);
    const nextPath = path.join(path.dirname(previousProject.path), slugifyProjectName(name));
    const resolvedPreviousPath = path.resolve(previousProject.path);
    const resolvedNextPath = path.resolve(nextPath);
    const samePath = resolvedPreviousPath === resolvedNextPath;
    const sameFilesystemPath = pathsReferToSameLocation(resolvedPreviousPath, resolvedNextPath);
    if (!sameFilesystemPath && existsSync(nextPath)) throw new Error(`Project path already exists: ${nextPath}`);

    if (!samePath) renameSync(previousProject.path, nextPath);
    try {
      ensureWorkspaceLayout({
        rootPath: nextPath,
        projectId: previousProject.id,
        name,
        locationType: previousProject.locationType,
      });
      const project = toProjectDto(this.store.renameProject(previousProject.path, nextPath, name));
      return Object.freeze({ previousProject, project });
    } catch (error) {
      if (!samePath && existsSync(nextPath) && (sameFilesystemPath || !existsSync(previousProject.path))) {
        renameSync(nextPath, previousProject.path);
      }
      throw error;
    }
  }

  rollbackProjectRename(result: ProjectRenameResult): void {
    const currentPath = path.resolve(result.project.path);
    const previousPath = path.resolve(result.previousProject.path);
    if (currentPath !== previousPath) {
      if (!existsSync(currentPath)) throw new Error(`Project path does not exist: ${currentPath}`);
      if (!pathsReferToSameLocation(currentPath, previousPath) && existsSync(previousPath)) {
        throw new Error(`Project path already exists: ${previousPath}`);
      }
      renameSync(currentPath, previousPath);
    }
    ensureWorkspaceLayout({
      rootPath: previousPath,
      projectId: result.previousProject.id,
      name: result.previousProject.name,
      locationType: result.previousProject.locationType,
    });
    this.store.renameProject(currentPath, previousPath, result.previousProject.name);
  }

  switchProject(projectPath: string | null): ProjectSnapshot {
    if (projectPath === null) {
      this.setActiveProject(null);
      return this.getSnapshot();
    }
    const normalizedPath = path.resolve(this.requirePath(projectPath));
    const project = this.store.getProject(normalizedPath);
    if (!project) throw new Error(`Project not found: ${normalizedPath}`);
    this.store.upsertProject({
      id: project.id,
      path: project.path,
      name: project.name,
      locationType: project.locationType,
      trusted: project.trusted,
    });
    this.setActiveProject(project.id);
    return this.getSnapshot();
  }

  removeProject(projectPath: string): ProjectSnapshot {
    const normalizedPath = path.resolve(this.requirePath(projectPath));
    const removed = this.store.getProject(normalizedPath);
    this.store.removeProject(normalizedPath);
    if (removed?.id === this.activeProjectId) this.setActiveProject(null);
    return this.getSnapshot();
  }

  restoreProject(input: ProjectRecord): ProjectDto {
    const restored = this.store.restoreProject(input);
    return toProjectDto(restored);
  }

  private getDefaultParentPath(): string {
    return getDefaultProjectsRoot();
  }

  private nextAvailableProjectPath(parentPath: string, slug: string): string {
    let candidate = path.join(parentPath, slug);
    let suffix = 2;
    while (existsSync(candidate)) {
      candidate = path.join(parentPath, `${slug}-${suffix}`);
      suffix += 1;
    }
    return candidate;
  }

  private setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
    this.store.setActiveProjectId(projectId);
  }

  private requireName(name: string): string {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Project name is required.");
    if (normalizedName.length > 120) throw new Error("Project name must be 120 characters or fewer.");
    return normalizedName;
  }

  private requirePath(projectPath: string): string {
    const normalizedPath = projectPath.trim();
    if (!normalizedPath) throw new Error("Project path is required.");
    return normalizedPath;
  }

  private requireParentDirectory(parentPath: string): void {
    if (!existsSync(parentPath)) throw new Error(`Project resource directory does not exist: ${parentPath}`);
    if (!statSync(parentPath).isDirectory()) throw new Error(`Project resource path is not a directory: ${parentPath}`);
  }
}
