import type { ProjectLocationType } from "../workspace/ProjectLayout.ts";

export type ProjectRecord = {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly locationType: ProjectLocationType;
  readonly trusted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastOpenedAt: Date;
};

export interface ProjectStore {
  upsertProject(input: {
    readonly id: string;
    readonly path: string;
    readonly name: string;
    readonly locationType: ProjectLocationType;
    readonly trusted?: boolean;
  }): ProjectRecord;
  getProject(projectPath: string): ProjectRecord | null;
  getProjectById(projectId: string): ProjectRecord | null;
  renameProject(projectPath: string, nextPath: string, name: string): ProjectRecord;
  listProjects(): ProjectRecord[];
  removeProject(projectPath: string): void;
  getActiveProjectId(): string | null;
  setActiveProjectId(projectId: string | null): void;
}