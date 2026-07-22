import path from "node:path";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import type { CreateProjectRequest, ProjectDto, ProjectSnapshot } from "./projectContracts.ts";
import type { ProjectRecord, ProjectStore } from "./projectPorts.ts";
import { getCustomizeWorkSpace, getDefaultWorkSpace } from "../workspace/path.ts";

function toProjectDto(project: ProjectRecord): ProjectDto {
  return Object.freeze({
    path: project.path,
    name: project.name,
    trusted: project.trusted,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    lastOpenedAt: project.lastOpenedAt.toISOString(),
  });
}

function slugifyProjectName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled-project";
}

export default class ProjectApplication {
  private activeProjectPath: string | null = null;

  constructor(private readonly store: ProjectStore) {
    const [recentProject] = store.listProjects();
    this.activeProjectPath = recentProject?.path ?? null;
  }

  getActiveProjectPath(): string | null {
    return this.activeProjectPath;
  }

  getSnapshot(): ProjectSnapshot {
    const activeProject = this.activeProjectPath
      ? this.store.getProject(this.activeProjectPath)
      : null;
    return Object.freeze({
      activeProjectPath: activeProject?.path ?? null,
      activeProject: activeProject ? toProjectDto(activeProject) : null,
      projects: Object.freeze(this.store.listProjects().map(toProjectDto)),
    });
  }

  createProject(request: CreateProjectRequest): ProjectDto {
    const name = this.requireName(request.name);
    const parentPath = path.resolve(request.parentPath?.trim() || this.getDefaultParentPath());
    const projectPath = this.nextAvailableProjectPath(parentPath, slugifyProjectName(name));
    mkdirSync(projectPath, { recursive: true });

    if (request.createAgentsFile) {
      const agentsPath = path.join(projectPath, "AGENTS.md");
      if (!existsSync(agentsPath)) {
        writeFileSync(agentsPath, "# Project Instructions\n\nDescribe project goals, coding style, constraints, and context here.\n", "utf-8");
      }
    }

    const project = this.store.upsertProject({ path: projectPath, name, trusted: true });
    this.activeProjectPath = project.path;
    return toProjectDto(project);
  }

  openProject(projectPath: string): ProjectDto {
    const normalizedPath = path.resolve(this.requirePath(projectPath));
    if (!existsSync(normalizedPath)) {
      throw new Error(`Project path does not exist: ${normalizedPath}`);
    }
    if (!statSync(normalizedPath).isDirectory()) {
      throw new Error(`Project path is not a directory: ${normalizedPath}`);
    }

    const project = this.store.upsertProject({
      path: normalizedPath,
      name: path.basename(normalizedPath) || normalizedPath,
      trusted: true,
    });
    this.activeProjectPath = project.path;
    return toProjectDto(project);
  }

  switchProject(projectPath: string | null): ProjectSnapshot {
    if (projectPath === null) {
      this.activeProjectPath = null;
      return this.getSnapshot();
    }

    const normalizedPath = path.resolve(this.requirePath(projectPath));
    const project = this.store.getProject(normalizedPath);
    if (!project) {
      throw new Error(`Project not found: ${normalizedPath}`);
    }
    this.store.upsertProject({ path: project.path, name: project.name, trusted: project.trusted });
    this.activeProjectPath = project.path;
    return this.getSnapshot();
  }

  removeProject(projectPath: string): ProjectSnapshot {
    const normalizedPath = path.resolve(this.requirePath(projectPath));
    this.store.removeProject(normalizedPath);
    if (this.activeProjectPath === normalizedPath) {
      this.activeProjectPath = this.store.listProjects()[0]?.path ?? null;
    }
    return this.getSnapshot();
  }

  private getDefaultParentPath(): string {
    return getCustomizeWorkSpace() || getDefaultWorkSpace();
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

  private requireName(name: string): string {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Project name is required.");
    return normalizedName;
  }

  private requirePath(projectPath: string): string {
    const normalizedPath = projectPath.trim();
    if (!normalizedPath) throw new Error("Project path is required.");
    return normalizedPath;
  }
}
