import path from "node:path";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  ProjectRecord,
  ProjectStore,
} from "../../application/projectPorts.ts";
import type { ProjectLocationType } from "../../workspace/ProjectLayout.ts";

type ProjectRow = {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly location_type: ProjectLocationType;
  readonly trusted: number;
  readonly created_at: number;
  readonly updated_at: number;
  readonly last_opened_at: number;
};

function projectPathKey(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export default class SqliteProjectStore implements ProjectStore {
  constructor(private readonly database: BetterSqliteDatabase) {}

  upsertProject(input: {
    readonly id: string;
    readonly path: string;
    readonly name: string;
    readonly locationType: ProjectLocationType;
    readonly trusted?: boolean;
  }): ProjectRecord {
    const projectPath = path.resolve(input.path);
    const pathKey = projectPathKey(projectPath);
    const now = Date.now();
    const transaction = this.database.transaction(() => {
      const existing = this.database.prepare(
        "SELECT * FROM projects WHERE id = ? OR path_key = ? LIMIT 1",
      ).get(input.id, pathKey) as ProjectRow | undefined;
      if (existing) {
        this.database.prepare(`
          UPDATE projects
          SET id = ?, path = ?, path_key = ?, name = ?, location_type = ?,
              trusted = ?, updated_at = ?, last_opened_at = ?
          WHERE id = ?
        `).run(
          input.id,
          projectPath,
          pathKey,
          input.name,
          input.locationType,
          input.trusted === undefined ? existing.trusted : Number(input.trusted),
          now,
          now,
          existing.id,
        );
      } else {
        this.database.prepare(`
          INSERT INTO projects (
            id, path, path_key, name, location_type, trusted,
            created_at, updated_at, last_opened_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.id,
          projectPath,
          pathKey,
          input.name,
          input.locationType,
          Number(input.trusted ?? true),
          now,
          now,
          now,
        );
      }
      return this.requireRowById(input.id);
    });
    return this.toRecord(transaction());
  }

  getProject(projectPath: string): ProjectRecord | null {
    const row = this.database.prepare(
      "SELECT * FROM projects WHERE path_key = ?",
    ).get(projectPathKey(projectPath)) as ProjectRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  getProjectById(projectId: string): ProjectRecord | null {
    const row = this.database.prepare(
      "SELECT * FROM projects WHERE id = ?",
    ).get(projectId) as ProjectRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  renameProject(projectPath: string, nextPath: string, name: string): ProjectRecord {
    const existing = this.getProject(projectPath);
    if (!existing) throw new Error(`Project not found: ${path.resolve(projectPath)}`);
    const resolvedNextPath = path.resolve(nextPath);
    try {
      this.database.prepare(`
        UPDATE projects
        SET path = ?, path_key = ?, name = ?, updated_at = ?, last_opened_at = ?
        WHERE id = ?
      `).run(
        resolvedNextPath,
        projectPathKey(resolvedNextPath),
        name,
        Date.now(),
        Date.now(),
        existing.id,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new Error(`Project already registered: ${resolvedNextPath}`);
      }
      throw error;
    }
    return this.toRecord(this.requireRowById(existing.id));
  }

  listProjects(): ProjectRecord[] {
    return (this.database.prepare(
      "SELECT * FROM projects ORDER BY last_opened_at DESC, id ASC",
    ).all() as ProjectRow[]).map((row) => this.toRecord(row));
  }

  removeProject(projectPath: string): void {
    this.database.prepare("DELETE FROM projects WHERE path_key = ?")
      .run(projectPathKey(projectPath));
  }

  getActiveProjectId(): string | null {
    const row = this.database.prepare(
      "SELECT active_project_id FROM app_state WHERE singleton = 1",
    ).get() as { active_project_id: string | null };
    return row.active_project_id;
  }

  setActiveProjectId(projectId: string | null): void {
    if (projectId !== null && !this.getProjectById(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
    this.database.prepare(
      "UPDATE app_state SET active_project_id = ? WHERE singleton = 1",
    ).run(projectId);
  }

  private requireRowById(projectId: string): ProjectRow {
    const row = this.database.prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as ProjectRow | undefined;
    if (!row) throw new Error(`Project not found: ${projectId}`);
    return row;
  }

  private toRecord(row: ProjectRow): ProjectRecord {
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      locationType: row.location_type,
      trusted: row.trusted === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastOpenedAt: new Date(row.last_opened_at),
    };
  }
}
