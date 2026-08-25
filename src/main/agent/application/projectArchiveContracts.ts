import type { ProjectLocationType } from "../workspace/ProjectLayout.ts";

export const PROJECT_ARCHIVE_FORMAT_VERSION = 1;

export type ProjectArchiveState =
  | "creating"
  | "available"
  | "corrupted"
  | "restored";

export type ProjectArchiveBookManifest = {
  readonly sourceBookId: string;
  readonly snapshotPath: "book-snapshot/book.sqlite";
};

export type ProjectArchiveManifest = {
  readonly format: "storyos-project-archive";
  readonly formatVersion: number;
  readonly archiveId: string;
  readonly createdAt: string;
  readonly applicationVersion: string;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly originalPath: string;
    readonly locationType: ProjectLocationType;
    readonly trusted: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly lastOpenedAt: string;
  };
  readonly book: ProjectArchiveBookManifest | null;
};

export type ProjectArchiveRecord = {
  readonly id: string;
  readonly sourceProjectId: string;
  readonly bookId: string | null;
  readonly archivePath: string;
  readonly state: ProjectArchiveState;
  readonly formatVersion: number;
  readonly manifestHash: string;
  readonly createdAt: Date;
  readonly restoredAt: Date | null;
};

export type ProjectArchiveDto = Omit<
  ProjectArchiveRecord,
  "createdAt" | "restoredAt"
> & {
  readonly createdAt: string;
  readonly restoredAt: string | null;
};

export type RestoreProjectArchiveRequest = {
  readonly archiveId: string;
  readonly targetPath: string;
  readonly bookStrategy: "snapshot" | "current";
};

export type RestoreProjectArchiveResult = {
  readonly archive: ProjectArchiveDto;
  readonly projectId: string;
  readonly projectPath: string;
  readonly bookId: string | null;
  readonly bookStrategy: "snapshot" | "current";
};

export type ProjectArchiveOperationState =
  | "preparing"
  | "files_published"
  | "registered"
  | "completed"
  | "failed";

export type ProjectArchiveOperationRecord = {
  readonly id: string;
  readonly archiveId: string;
  readonly targetPath: string;
  readonly bookStrategy: "snapshot" | "current";
  readonly restoredBookId: string | null;
  readonly state: ProjectArchiveOperationState;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
