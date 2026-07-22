export type ProjectRecord = {
  readonly path: string;
  readonly name: string;
  readonly trusted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastOpenedAt: Date;
};

export interface ProjectStore {
  upsertProject(input: {
    readonly path: string;
    readonly name: string;
    readonly trusted?: boolean;
  }): ProjectRecord;
  getProject(projectPath: string): ProjectRecord | null;
  listProjects(): ProjectRecord[];
  removeProject(projectPath: string): void;
}
