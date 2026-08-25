import type {
  ProjectArchiveRecord,
  ProjectArchiveState,
  ProjectArchiveOperationRecord,
  ProjectArchiveOperationState,
} from "./projectArchiveContracts.ts";

export interface ProjectArchiveStore {
  create(input: {
    readonly id: string;
    readonly sourceProjectId: string;
    readonly bookId: string | null;
    readonly archivePath: string;
    readonly formatVersion: number;
    readonly createdAt: Date;
  }): ProjectArchiveRecord;
  getById(archiveId: string): ProjectArchiveRecord | null;
  list(input?: {
    readonly bookId?: string;
    readonly sourceProjectId?: string;
  }): readonly ProjectArchiveRecord[];
  updateState(input: {
    readonly archiveId: string;
    readonly state: ProjectArchiveState;
    readonly manifestHash?: string;
    readonly restoredAt?: Date | null;
  }): ProjectArchiveRecord;
  beginRestore(input: {
    readonly id: string;
    readonly archiveId: string;
    readonly targetPath: string;
    readonly bookStrategy: "snapshot" | "current";
    readonly restoredBookId: string | null;
  }): ProjectArchiveOperationRecord;
  updateOperation(input: {
    readonly operationId: string;
    readonly state: ProjectArchiveOperationState;
    readonly errorMessage?: string | null;
  }): ProjectArchiveOperationRecord;
  listIncompleteOperations(): readonly ProjectArchiveOperationRecord[];
}
