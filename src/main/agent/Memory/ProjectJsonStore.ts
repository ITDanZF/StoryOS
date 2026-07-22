import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAgentHome } from "../workspace/path.ts";
import type { ProjectRecord, ProjectStore } from "../application/projectPorts.ts";

type JsonProject = {
  path: string;
  name: string;
  trusted: boolean;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

type JsonProjectState = {
  projects: JsonProject[];
};

export default class ProjectJsonStore implements ProjectStore {
  private readonly projectsPath: string;

  constructor(projectsPath = path.join(getAgentHome(), "projects.json")) {
    this.projectsPath = projectsPath;
    this.ensureStore();
  }

  upsertProject(input: {
    readonly path: string;
    readonly name: string;
    readonly trusted?: boolean;
  }): ProjectRecord {
    const state = this.readState();
    const now = new Date().toISOString();
    const projectPath = path.resolve(input.path);
    const existing = state.projects.find((project) => project.path === projectPath);

    if (existing) {
      existing.name = input.name;
      existing.trusted = input.trusted ?? existing.trusted;
      existing.updatedAt = now;
      existing.lastOpenedAt = now;
      this.writeState(state);
      return this.toProjectRecord(existing);
    }

    const project: JsonProject = {
      path: projectPath,
      name: input.name,
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
    const project = this.readState().projects.find((item) => item.path === normalizedPath);
    return project ? this.toProjectRecord(project) : null;
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
    state.projects = state.projects.filter((project) => project.path !== normalizedPath);
    this.writeState(state);
  }

  private ensureStore() {
    mkdirSync(path.dirname(this.projectsPath), { recursive: true });
    if (!existsSync(this.projectsPath)) {
      this.writeState({ projects: [] });
    }
  }

  private readState(): JsonProjectState {
    return JSON.parse(readFileSync(this.projectsPath, "utf-8")) as JsonProjectState;
  }

  private writeState(state: JsonProjectState) {
    writeFileSync(this.projectsPath, JSON.stringify(state, null, 2), "utf-8");
  }

  private toProjectRecord(project: JsonProject): ProjectRecord {
    return {
      path: project.path,
      name: project.name,
      trusted: project.trusted,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
      lastOpenedAt: new Date(project.lastOpenedAt),
    };
  }
}
