import { PROJECT_SCHEMA } from "./projectSchema.ts";
import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";
import Database from "better-sqlite3";

export const PROJECT_DATABASE_ID = 0x53544f50;

const migrations: readonly SqliteMigration[] = [
  {
    version: 100,
    up(database) {
      database.exec(PROJECT_SCHEMA);
    },
  },
];

export const PROJECT_DATABASE_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export default class ProjectDatabase extends SqliteDatabase {
  static validateExisting(databasePath: string): void {
    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const applicationId = database.pragma("application_id", {
        simple: true,
      }) as number;
      if (applicationId !== PROJECT_DATABASE_ID) {
        throw new Error("The SQLite file is not a StoryOS project database.");
      }
      const schemaVersion = database.pragma("user_version", {
        simple: true,
      }) as number;
      if (schemaVersion !== PROJECT_DATABASE_SCHEMA_VERSION) {
        throw new Error(`Unsupported StoryOS project schema: ${schemaVersion}`);
      }
      const integrity = database.pragma("quick_check(1)") as Array<{
        readonly quick_check: string;
      }>;
      if (integrity.length !== 1 || integrity[0]?.quick_check !== "ok") {
        throw new Error(
          "The StoryOS project database failed its integrity check.",
        );
      }
    } finally {
      database.close();
    }
  }

  constructor(databasePath: string) {
    super(databasePath, PROJECT_DATABASE_ID, migrations);
  }
}
