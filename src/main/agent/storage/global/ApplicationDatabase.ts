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
  {
    version: 2,
    up(database) {
      database.exec(`
        CREATE UNIQUE INDEX ux_project_books_writable_book
          ON project_books(book_id);
      `);
    },
  },
  {
    version: 3,
    up(database) {
      database.exec(`
        ALTER TABLE project_books RENAME TO project_books_v2;
        ALTER TABLE books RENAME TO books_v2;

        CREATE TABLE books (
          id TEXT PRIMARY KEY,
          storage_path TEXT NOT NULL,
          path_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL DEFAULT 'available'
            CHECK (state IN (
              'available', 'missing', 'importing', 'trashed', 'corrupted'
            )),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_opened_at INTEGER
        );

        INSERT INTO books(
          id, storage_path, path_key, state,
          created_at, updated_at, last_opened_at
        )
        SELECT
          id, storage_path, path_key, state,
          created_at, updated_at, last_opened_at
        FROM books_v2;

        CREATE TABLE project_books (
          project_id TEXT PRIMARY KEY
            REFERENCES projects(id) ON DELETE CASCADE,
          book_id TEXT NOT NULL
            REFERENCES books(id) ON DELETE RESTRICT,
          attached_at INTEGER NOT NULL
        );

        INSERT INTO project_books(project_id, book_id, attached_at)
        SELECT project_id, book_id, attached_at
        FROM project_books_v2;

        DROP TABLE project_books_v2;
        DROP TABLE books_v2;

        CREATE INDEX idx_books_last_opened_at
          ON books(last_opened_at DESC);
        CREATE INDEX idx_project_books_book_id
          ON project_books(book_id);
        CREATE UNIQUE INDEX ux_project_books_writable_book
          ON project_books(book_id);
      `);
    },
  },
  {
    version: 4,
    up(database) {
      database.exec(`
        CREATE TABLE book_deletion_log (
          operation_id TEXT PRIMARY KEY,
          book_id TEXT NOT NULL,
          deleted_at INTEGER NOT NULL,
          cleanup_state TEXT NOT NULL DEFAULT 'pending'
            CHECK (cleanup_state IN ('pending', 'completed', 'failed')),
          cleanup_updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_book_deletion_log_book
          ON book_deletion_log(book_id, deleted_at DESC);
      `);
    },
  },
  {
    version: 5,
    up(database) {
      database.exec(`
        CREATE TABLE project_archives (
          id TEXT PRIMARY KEY,
          source_project_id TEXT NOT NULL,
          book_id TEXT,
          archive_path TEXT NOT NULL,
          path_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL
            CHECK (state IN ('creating', 'available', 'corrupted', 'restored')),
          format_version INTEGER NOT NULL,
          manifest_hash TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          restored_at INTEGER
        );

        CREATE INDEX idx_project_archives_source_project
          ON project_archives(source_project_id, created_at DESC);

        CREATE INDEX idx_project_archives_book
          ON project_archives(book_id, created_at DESC);

        CREATE TABLE project_archive_operations (
          id TEXT PRIMARY KEY,
          archive_id TEXT NOT NULL
            REFERENCES project_archives(id) ON DELETE RESTRICT,
          target_path TEXT NOT NULL,
          book_strategy TEXT NOT NULL
            CHECK (book_strategy IN ('snapshot', 'current')),
          restored_book_id TEXT,
          state TEXT NOT NULL
            CHECK (state IN (
              'preparing', 'files_published', 'registered',
              'completed', 'failed'
            )),
          error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_project_archive_operations_incomplete
          ON project_archive_operations(state, created_at ASC);
      `);
    },
  },
  {
    version: 6,
    up(database) {
      database.exec(`
        CREATE TABLE book_trash_entries (
          book_id TEXT PRIMARY KEY
            REFERENCES books(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          trashed_at INTEGER NOT NULL
        );

        CREATE INDEX idx_book_trash_entries_trashed_at
          ON book_trash_entries(trashed_at DESC);
      `);
    },
  },
];

export default class ApplicationDatabase extends SqliteDatabase {
  constructor(agentHome: string) {
    super(path.join(agentHome, "app.sqlite"), APPLICATION_DATABASE_ID, migrations);
  }
}
