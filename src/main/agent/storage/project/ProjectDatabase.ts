import type { SqliteMigration } from "../common/SqliteDatabase.ts";
import SqliteDatabase from "../common/SqliteDatabase.ts";

const PROJECT_DATABASE_ID = 0x53544f50;

const migrations: readonly SqliteMigration[] = [
  {
    version: 1,
    up(database) {
      database.exec(`
        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_threads_updated_at
          ON threads(updated_at DESC);

        CREATE TABLE workspace_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          active_thread_id TEXT
            REFERENCES threads(id) ON UPDATE CASCADE ON DELETE SET NULL,
          updated_at INTEGER NOT NULL
        );

        INSERT INTO workspace_state(singleton, active_thread_id, updated_at)
        VALUES (1, NULL, 0);

        CREATE TABLE thread_skills (
          thread_id TEXT NOT NULL
            REFERENCES threads(id) ON DELETE CASCADE,
          skill_id TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('active', 'disabled')),
          PRIMARY KEY(thread_id, skill_id)
        );

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL
            REFERENCES threads(id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL,
          role TEXT NOT NULL
            CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(thread_id, sequence)
        );

        CREATE INDEX idx_messages_thread_sequence
          ON messages(thread_id, sequence);

        CREATE TABLE agent_runs (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL
            REFERENCES threads(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK (
            status IN (
              'queued', 'running', 'cancelling', 'completed',
              'aborted', 'timed_out', 'failed'
            )
          ),
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          duration_ms INTEGER,
          output TEXT,
          error_name TEXT,
          error_message TEXT
        );

        CREATE INDEX idx_agent_runs_started_at
          ON agent_runs(started_at DESC);

        CREATE INDEX idx_agent_runs_thread_started
          ON agent_runs(thread_id, started_at DESC);
      `);
    },
  },
  {
    version: 2,
    up(database) {
      database.exec(`
        CREATE TABLE indexed_files (
          path TEXT PRIMARY KEY,
          revision TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          mtime_ms REAL NOT NULL,
          indexed_at INTEGER NOT NULL
        );

        CREATE TABLE text_chunks (
          row_id INTEGER PRIMARY KEY,
          id TEXT NOT NULL UNIQUE,
          file_path TEXT NOT NULL
            REFERENCES indexed_files(path) ON DELETE CASCADE,
          revision TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          chunk_type TEXT NOT NULL
            CHECK (chunk_type IN ('heading', 'section')),
          start_line INTEGER NOT NULL,
          start_column INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          end_column INTEGER NOT NULL,
          heading_path TEXT NOT NULL,
          heading TEXT NOT NULL,
          content TEXT NOT NULL,
          UNIQUE(file_path, chunk_index)
        );

        CREATE INDEX idx_text_chunks_file_index
          ON text_chunks(file_path, chunk_index);

        CREATE VIRTUAL TABLE text_chunks_fts USING fts5(
          content,
          heading,
          content = 'text_chunks',
          content_rowid = 'row_id',
          tokenize = 'trigram'
        );

        CREATE TRIGGER text_chunks_ai AFTER INSERT ON text_chunks BEGIN
          INSERT INTO text_chunks_fts(rowid, content, heading)
          VALUES (new.row_id, new.content, new.heading);
        END;

        CREATE TRIGGER text_chunks_ad AFTER DELETE ON text_chunks BEGIN
          INSERT INTO text_chunks_fts(text_chunks_fts, rowid, content, heading)
          VALUES ('delete', old.row_id, old.content, old.heading);
        END;

        CREATE TRIGGER text_chunks_au AFTER UPDATE ON text_chunks BEGIN
          INSERT INTO text_chunks_fts(text_chunks_fts, rowid, content, heading)
          VALUES ('delete', old.row_id, old.content, old.heading);
          INSERT INTO text_chunks_fts(rowid, content, heading)
          VALUES (new.row_id, new.content, new.heading);
        END;
      `);
    },
  },
  {
    version: 3,
    up(database) {
      database.exec(`
        CREATE TABLE novels (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          synopsis TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL
            CHECK (status IN ('planning', 'writing', 'completed', 'archived')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_novels_updated_at
          ON novels(updated_at DESC);

        CREATE TABLE volumes (
          id TEXT PRIMARY KEY,
          novel_id TEXT NOT NULL
            REFERENCES novels(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(novel_id, sort_order)
        );

        CREATE TABLE chapters (
          id TEXT PRIMARY KEY,
          novel_id TEXT NOT NULL
            REFERENCES novels(id) ON DELETE CASCADE,
          volume_id TEXT
            REFERENCES volumes(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('outline', 'draft', 'revising', 'completed')),
          sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
          current_revision_id TEXT
            REFERENCES chapter_revisions(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX idx_chapters_unvolumed_order
          ON chapters(novel_id, sort_order)
          WHERE volume_id IS NULL;

        CREATE UNIQUE INDEX idx_chapters_volume_order
          ON chapters(volume_id, sort_order)
          WHERE volume_id IS NOT NULL;

        CREATE INDEX idx_chapters_novel
          ON chapters(novel_id, volume_id, sort_order);

        CREATE TABLE chapter_revisions (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL
            REFERENCES chapters(id) ON DELETE CASCADE,
          revision_number INTEGER NOT NULL CHECK (revision_number > 0),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          character_count INTEGER NOT NULL CHECK (character_count >= 0),
          change_summary TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          UNIQUE(chapter_id, revision_number)
        );

        CREATE INDEX idx_chapter_revisions_chapter
          ON chapter_revisions(chapter_id, revision_number DESC);
      `);
    },
  },
  {
    version: 4,
    up(database) {
      database.exec(`
        CREATE UNIQUE INDEX idx_novels_project_singleton
          ON novels((1));
      `);
    },
  },
];

export default class ProjectDatabase extends SqliteDatabase {
  constructor(databasePath: string) {
    super(databasePath, PROJECT_DATABASE_ID, migrations);
  }
}
