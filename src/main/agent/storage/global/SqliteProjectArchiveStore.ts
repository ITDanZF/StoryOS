import path from "node:path";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  ProjectArchiveRecord,
  ProjectArchiveState,
  ProjectArchiveOperationRecord,
  ProjectArchiveOperationState,
} from "../../application/projectArchiveContracts.ts";
import type { ProjectArchiveStore } from "../../application/projectArchivePorts.ts";

type ArchiveRow = {
  readonly id: string;
  readonly source_project_id: string;
  readonly book_id: string | null;
  readonly archive_path: string;
  readonly state: ProjectArchiveState;
  readonly format_version: number;
  readonly manifest_hash: string;
  readonly created_at: number;
  readonly restored_at: number | null;
};

type ArchiveOperationRow = {
  readonly id: string;
  readonly archive_id: string;
  readonly target_path: string;
  readonly book_strategy: "snapshot" | "current";
  readonly restored_book_id: string | null;
  readonly state: ProjectArchiveOperationState;
  readonly error_message: string | null;
  readonly created_at: number;
  readonly updated_at: number;
};

function archivePathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export default class SqliteProjectArchiveStore implements ProjectArchiveStore {
  constructor(private readonly database: BetterSqliteDatabase) {}

  create(input: {
    readonly id: string;
    readonly sourceProjectId: string;
    readonly bookId: string | null;
    readonly archivePath: string;
    readonly formatVersion: number;
    readonly createdAt: Date;
  }): ProjectArchiveRecord {
    const archivePath = path.resolve(input.archivePath);
    this.database.prepare(`
      INSERT INTO project_archives(
        id, source_project_id, book_id, archive_path, path_key,
        state, format_version, manifest_hash, created_at, restored_at
      ) VALUES (?, ?, ?, ?, ?, 'creating', ?, '', ?, NULL)
    `).run(
      input.id,
      input.sourceProjectId,
      input.bookId,
      archivePath,
      archivePathKey(archivePath),
      input.formatVersion,
      input.createdAt.getTime(),
    );
    return this.require(input.id);
  }

  getById(archiveId: string): ProjectArchiveRecord | null {
    const row = this.database.prepare(
      "SELECT * FROM project_archives WHERE id = ?",
    ).get(archiveId) as ArchiveRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  list(input: {
    readonly bookId?: string;
    readonly sourceProjectId?: string;
  } = {}): readonly ProjectArchiveRecord[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (input.bookId !== undefined) {
      clauses.push("book_id = ?");
      values.push(input.bookId);
    }
    if (input.sourceProjectId !== undefined) {
      clauses.push("source_project_id = ?");
      values.push(input.sourceProjectId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database.prepare(`
      SELECT * FROM project_archives
      ${where}
      ORDER BY created_at DESC, id ASC
    `).all(...values) as ArchiveRow[];
    return Object.freeze(rows.map((row) => this.toRecord(row)));
  }

  updateState(input: {
    readonly archiveId: string;
    readonly state: ProjectArchiveState;
    readonly manifestHash?: string;
    readonly restoredAt?: Date | null;
  }): ProjectArchiveRecord {
    const current = this.require(input.archiveId);
    const result = this.database.prepare(`
      UPDATE project_archives
      SET state = ?, manifest_hash = ?, restored_at = ?
      WHERE id = ?
    `).run(
      input.state,
      input.manifestHash ?? current.manifestHash,
      input.restoredAt === undefined
        ? current.restoredAt?.getTime() ?? null
        : input.restoredAt?.getTime() ?? null,
      input.archiveId,
    );
    if (result.changes !== 1) {
      throw new Error(`Project archive not found: ${input.archiveId}`);
    }
    return this.require(input.archiveId);
  }

  beginRestore(input: {
    readonly id: string;
    readonly archiveId: string;
    readonly targetPath: string;
    readonly bookStrategy: "snapshot" | "current";
    readonly restoredBookId: string | null;
  }): ProjectArchiveOperationRecord {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO project_archive_operations(
        id, archive_id, target_path, book_strategy, restored_book_id,
        state, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'preparing', NULL, ?, ?)
    `).run(
      input.id,
      input.archiveId,
      path.resolve(input.targetPath),
      input.bookStrategy,
      input.restoredBookId,
      now,
      now,
    );
    return this.requireOperation(input.id);
  }

  updateOperation(input: {
    readonly operationId: string;
    readonly state: ProjectArchiveOperationState;
    readonly errorMessage?: string | null;
  }): ProjectArchiveOperationRecord {
    const current = this.requireOperation(input.operationId);
    const result = this.database.prepare(`
      UPDATE project_archive_operations
      SET state = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.state,
      input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      Date.now(),
      input.operationId,
    );
    if (result.changes !== 1) {
      throw new Error(`Project archive operation not found: ${input.operationId}`);
    }
    return this.requireOperation(input.operationId);
  }

  listIncompleteOperations(): readonly ProjectArchiveOperationRecord[] {
    const rows = this.database.prepare(`
      SELECT * FROM project_archive_operations
      WHERE state NOT IN ('completed', 'failed')
      ORDER BY created_at ASC, id ASC
    `).all() as ArchiveOperationRow[];
    return Object.freeze(rows.map((row) => this.toOperationRecord(row)));
  }

  private require(archiveId: string): ProjectArchiveRecord {
    const record = this.getById(archiveId);
    if (!record) throw new Error(`Project archive not found: ${archiveId}`);
    return record;
  }

  private requireOperation(operationId: string): ProjectArchiveOperationRecord {
    const row = this.database.prepare(`
      SELECT * FROM project_archive_operations WHERE id = ?
    `).get(operationId) as ArchiveOperationRow | undefined;
    if (!row) throw new Error(`Project archive operation not found: ${operationId}`);
    return this.toOperationRecord(row);
  }

  private toRecord(row: ArchiveRow): ProjectArchiveRecord {
    return Object.freeze({
      id: row.id,
      sourceProjectId: row.source_project_id,
      bookId: row.book_id,
      archivePath: row.archive_path,
      state: row.state,
      formatVersion: row.format_version,
      manifestHash: row.manifest_hash,
      createdAt: new Date(row.created_at),
      restoredAt: row.restored_at === null ? null : new Date(row.restored_at),
    });
  }

  private toOperationRecord(
    row: ArchiveOperationRow,
  ): ProjectArchiveOperationRecord {
    return Object.freeze({
      id: row.id,
      archiveId: row.archive_id,
      targetPath: row.target_path,
      bookStrategy: row.book_strategy,
      restoredBookId: row.restored_book_id,
      state: row.state,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
