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

        CREATE TABLE books (
          id TEXT PRIMARY KEY,
          storage_path TEXT NOT NULL,
          path_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL DEFAULT 'available'
            CHECK (state IN ('available', 'missing')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_opened_at INTEGER
        );

        CREATE INDEX idx_books_last_opened_at
          ON books(last_opened_at DESC);

        CREATE TABLE project_books (
          project_id TEXT PRIMARY KEY
            REFERENCES projects(id) ON DELETE CASCADE,
          book_id TEXT NOT NULL
            REFERENCES books(id) ON DELETE RESTRICT,
          attached_at INTEGER NOT NULL
        );

        CREATE INDEX idx_project_books_book_id
          ON project_books(book_id);

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
