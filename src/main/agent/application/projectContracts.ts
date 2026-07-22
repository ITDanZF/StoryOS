export type ProjectDto = {
  readonly path: string;
  readonly name: string;
  readonly trusted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
};

export type ProjectSnapshot = {
  readonly activeProjectPath: string | null;
  readonly activeProject: ProjectDto | null;
  readonly projects: readonly ProjectDto[];
};

export type CreateProjectRequest = {
  readonly name: string;
  readonly parentPath?: string;
  readonly createAgentsFile?: boolean;
};
