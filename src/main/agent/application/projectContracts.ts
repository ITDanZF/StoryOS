import type { ProjectLocationType } from "../workspace/ProjectLayout.ts";

export type ProjectDto = {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly locationType: ProjectLocationType;
  readonly trusted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
};

export type SystemWorkspaceDto = {
  readonly id: "system-default";
  readonly name: "无项目对话";
  readonly path: string;
};

export type ProjectSnapshot = {
  readonly activeProjectId: string | null;
  readonly activeProjectPath: string | null;
  readonly activeProject: ProjectDto | null;
  readonly projects: readonly ProjectDto[];
  readonly creationDefaults: ProjectCreationDefaults;
  readonly systemWorkspace: SystemWorkspaceDto;
};

export type ProjectCreationDefaults = {
  readonly parentPath: string;
};

export type CreateProjectRequest = {
  readonly name: string;
  readonly parentPath?: string;
  readonly createAgentsFile?: boolean;
  readonly bookId?: string;
};

export type RenameProjectRequest = {
  readonly projectPath: string;
  readonly name: string;
};
