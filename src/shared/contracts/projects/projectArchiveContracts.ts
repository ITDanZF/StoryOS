export type ProjectArchiveSummary = {
  readonly archiveId: string;
  readonly sourceProjectId: string;
  readonly projectName: string | null;
  readonly originalProjectPath: string | null;
  readonly bookId: string | null;
  readonly state: ProjectArchiveState;
  readonly containsBookSnapshot: boolean;
  readonly availableBookStrategies: readonly ProjectArchiveBookStrategy[];
  readonly createdAt: string;
  readonly restoredAt: string | null;
};

export type ProjectArchiveState = "creating" | "available" | "corrupted" | "restored";

export type ProjectArchiveBookStrategy = "snapshot" | "current";

export type RestoreProjectArchiveResult = {
  readonly archive: ProjectArchiveDto;
  readonly projectId: string;
  readonly projectPath: string;
  readonly bookId: string | null;
  readonly bookStrategy: ProjectArchiveBookStrategy;
};

export type ProjectArchiveDto = {
  readonly id: string;
  readonly sourceProjectId: string;
  readonly bookId: string | null;
  readonly archivePath: string;
  readonly state: ProjectArchiveState;
  readonly formatVersion: number;
  readonly manifestHash: string;
  readonly createdAt: string;
  readonly restoredAt: string | null;
};
