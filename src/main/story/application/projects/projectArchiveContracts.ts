import type {
  ProjectArchiveBookStrategy,
  ProjectArchiveState,
} from "../../../../shared/contracts/projects/projectArchiveContracts.ts";
import type { ProjectLocationType } from "../../workspace/ProjectLayout.ts";
export type {
  ProjectArchiveBookStrategy,
  ProjectArchiveDto,
  ProjectArchiveState,
  ProjectArchiveSummary,
  RestoreProjectArchiveResult,
} from "../../../../shared/contracts/projects/projectArchiveContracts.ts";

export const PROJECT_ARCHIVE_FORMAT_VERSION = 1;

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

export type RestoreProjectArchiveRequest = {
  readonly archiveId: string;
  readonly targetPath: string;
  readonly bookStrategy: ProjectArchiveBookStrategy;
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
  readonly bookStrategy: ProjectArchiveBookStrategy;
  readonly restoredBookId: string | null;
  readonly state: ProjectArchiveOperationState;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
