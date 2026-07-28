import Database, {
  type Database as BetterSqliteDatabase,
} from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type SqliteMigration = {
  readonly version: number;
  readonly up: (database: BetterSqliteDatabase) => void;
};

export default class SqliteDatabase {
  readonly handle: BetterSqliteDatabase;
  private closed = false;

  constructor(
    databasePath: string,
    applicationId: number,
    migrations: readonly SqliteMigration[],
  ) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.handle = new Database(databasePath);
    try {
      this.configure(applicationId);
      this.migrate(migrations);
    } catch (error) {
      this.handle.close();
      this.closed = true;
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.handle.close();
  }

  private configure(applicationId: number): void {
    this.handle.pragma("journal_mode = WAL");
    this.handle.pragma("synchronous = NORMAL");
    this.handle.pragma("foreign_keys = ON");
    this.handle.pragma("busy_timeout = 5000");
    this.handle.pragma("temp_store = MEMORY");

    const currentApplicationId = this.handle.pragma(
      "application_id",
      { simple: true },
    ) as number;
    if (currentApplicationId !== 0 && currentApplicationId !== applicationId) {
      throw new Error("The SQLite file belongs to another application.");
    }
    if (currentApplicationId === 0) {
      this.handle.pragma(`application_id = ${applicationId}`);
    }
  }

  private migrate(migrations: readonly SqliteMigration[]): void {
    const ordered = [...migrations].sort((left, right) => left.version - right.version);
    const versions = new Set<number>();
    for (const migration of ordered) {
      if (!Number.isInteger(migration.version) || migration.version <= 0) {
        throw new Error("SQLite migration versions must be positive integers.");
      }
      if (versions.has(migration.version)) {
        throw new Error(`Duplicate SQLite migration version: ${migration.version}`);
      }
      versions.add(migration.version);
    }

    let currentVersion = this.handle.pragma("user_version", {
      simple: true,
    }) as number;
    const latestVersion = ordered.at(-1)?.version ?? 0;
    if (currentVersion > latestVersion) {
      throw new Error(
        `SQLite schema version ${currentVersion} is newer than supported version ${latestVersion}.`,
      );
    }

    for (const migration of ordered) {
      if (migration.version <= currentVersion) continue;
      this.handle.transaction(() => {
        migration.up(this.handle);
        this.handle.pragma(`user_version = ${migration.version}`);
      })();
      currentVersion = migration.version;
    }
  }
}
