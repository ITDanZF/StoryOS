import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAgentHome } from "../workspace/path.ts";
import type { ProjectRecord, ProjectStore } from "../application/projectPorts.ts";
import type { ProjectLocationType } from "../workspace/ProjectLayout.ts";

type JsonProject = {
  id: string;
  path: string;
  name: string;
  locationType: ProjectLocationType;
  trusted: boolean;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

type JsonProjectState = {
  version: 2;
  activeProjectId: string | null;
  projects: JsonProject[];
};

export default class ProjectJsonStore implements ProjectStore {
  private readonly projectsPath: string;

  constructor(projectsPath = path.join(getAgentHome(), "projects.json")) {
    this.projectsPath = projectsPath;
    this.ensureStore();
  }

  upsertProject(input: {
    readonly id: string;
    readonly path: string;
    readonly name: string;
    readonly locationType: ProjectLocationType;
    readonly trusted?: boolean;
  }): ProjectRecord {
    const state = this.readState();
    const now = new Date().toISOString();
    const projectPath = path.resolve(input.path);
    const existing = state.projects.find((project) =>
      project.id === input.id || this.samePath(project.path, projectPath));

    if (existing) {
      existing.id = input.id;
      existing.path = projectPath;
      existing.name = input.name;
      existing.locationType = input.locationType;
      existing.trusted = input.trusted ?? existing.trusted;
      existing.updatedAt = now;
      existing.lastOpenedAt = now;
      this.writeState(state);
      return this.toProjectRecord(existing);
    }

    const project: JsonProject = {
      id: input.id,
      path: projectPath,
      name: input.name,
      locationType: input.locationType,
      trusted: input.trusted ?? true,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    state.projects.push(project);
    this.writeState(state);
    return this.toProjectRecord(project);
  }

  getProject(projectPath: string): ProjectRecord | null {
    const normalizedPath = path.resolve(projectPath);
    const project = this.readState().projects.find((item) => this.samePath(item.path, normalizedPath));
    return project ? this.toProjectRecord(project) : null;
  }

  getProjectById(projectId: string): ProjectRecord | null {
    const project = this.readState().projects.find((item) => item.id === projectId);
    return project ? this.toProjectRecord(project) : null;
  }

  renameProject(projectPath: string, nextPath: string, name: string): ProjectRecord {
    const normalizedPath = path.resolve(projectPath);
    const normalizedNextPath = path.resolve(nextPath);
    const state = this.readState();
    const project = state.projects.find((item) => this.samePath(item.path, normalizedPath));
    if (!project) throw new Error(`Project not found: ${normalizedPath}`);
    if (state.projects.some((item) => this.samePath(item.path, normalizedNextPath) && item !== project)) {
      throw new Error(`Project already registered: ${normalizedNextPath}`);
    }

    const now = new Date().toISOString();
    project.path = normalizedNextPath;
    project.name = name;
    project.updatedAt = now;
    project.lastOpenedAt = now;
    this.writeState(state);
    return this.toProjectRecord(project);
  }

  listProjects(): ProjectRecord[] {
    return this.readState().projects
      .slice()
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      .map((project) => this.toProjectRecord(project));
  }

  removeProject(projectPath: string): void {
    const normalizedPath = path.resolve(projectPath);
    const state = this.readState();
    const removed = state.projects.find((project) => this.samePath(project.path, normalizedPath));
    state.projects = state.projects.filter((project) => !this.samePath(project.path, normalizedPath));
    if (removed?.id === state.activeProjectId) state.activeProjectId = null;
    this.writeState(state);
  }

  getActiveProjectId(): string | null {
    return this.readState().activeProjectId;
  }

  setActiveProjectId(projectId: string | null): void {
    const state = this.readState();
    if (projectId !== null && !state.projects.some((project) => project.id === projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
    state.activeProjectId = projectId;
    this.writeState(state);
  }

  private ensureStore(): void {
    mkdirSync(path.dirname(this.projectsPath), { recursive: true });
    if (!existsSync(this.projectsPath)) {
      this.writeState({ version: 2, activeProjectId: null, projects: [] });
    }
  }

  private readState(): JsonProjectState {
    const value = JSON.parse(readFileSync(this.projectsPath, "utf-8")) as {
      version?: number;
      activeProjectId?: unknown;
      projects?: Array<Partial<JsonProject>>;
    };
    const projects = (value.projects ?? []).map((project) => ({
      id: typeof project.id === "string" && project.id ? project.id : `prj_${crypto.randomUUID()}`,
      path: path.resolve(String(project.path ?? "")),
      name: String(project.name ?? path.basename(String(project.path ?? ""))),
      locationType: project.locationType === "created" ? "created" as const : "linked" as const,
      trusted: project.trusted !== false,
      createdAt: String(project.createdAt ?? new Date().toISOString()),
      updatedAt: String(project.updatedAt ?? new Date().toISOString()),
      lastOpenedAt: String(project.lastOpenedAt ?? new Date().toISOString()),
    }));
    const state: JsonProjectState = {
      version: 2,
      activeProjectId: typeof value.activeProjectId === "string" &&
        projects.some((project) => project.id === value.activeProjectId)
        ? value.activeProjectId
        : null,
      projects,
    };
    if (value.version !== 2 || projects.some((project, index) => project.id !== value.projects?.[index]?.id)) {
      this.writeState(state);
    }
    return state;
  }

  private writeState(state: JsonProjectState): void {
    writeFileSync(this.projectsPath, JSON.stringify(state, null, 2), "utf-8");
  }

  private toProjectRecord(project: JsonProject): ProjectRecord {
    return {
      id: project.id,
      path: project.path,
      name: project.name,
      locationType: project.locationType,
      trusted: project.trusted,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
      lastOpenedAt: new Date(project.lastOpenedAt),
    };
  }

  private samePath(first: string, second: string): boolean {
    const left = path.resolve(first);
    const right = path.resolve(second);
    return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
  }
}