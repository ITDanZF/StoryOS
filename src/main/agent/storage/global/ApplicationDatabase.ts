import path from "node:path";
import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";

const APPLICATION_DATABASE_ID = 0x53544f41;

const migrations: readonly SqliteMigration[] = [
  {
    version: 1,
    up(database) {
      database.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          path_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          location_type TEXT NOT NULL
            CHECK (location_type IN ('created', 'linked')),
          trusted INTEGER NOT NULL DEFAULT 1
            CHECK (trusted IN (0, 1)),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_opened_at INTEGER NOT NULL
        );

        CREATE INDEX idx_projects_last_opened_at
          ON projects(last_opened_at DESC);

        CREATE TABLE app_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          active_project_id TEXT
            REFERENCES projects(id) ON UPDATE CASCADE ON DELETE SET NULL
        );

        INSERT INTO app_state(singleton, active_project_id) VALUES (1, NULL);
      `);
    },
  },
];

export default class ApplicationDatabase extends SqliteDatabase {
  constructor(agentHome: string) {
    super(path.join(agentHome, "app.sqlite"), APPLICATION_DATABASE_ID, migrations);
  }
}
