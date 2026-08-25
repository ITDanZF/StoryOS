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
        CREATE TABLE conversation_events (
          row_id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          thread_id TEXT NOT NULL
            REFERENCES threads(id) ON DELETE CASCADE,
          run_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          type TEXT NOT NULL,
          step_id TEXT,
          block_id TEXT,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(run_id, sequence)
        );

        CREATE INDEX idx_conversation_events_thread_run
          ON conversation_events(thread_id, run_id, sequence);

        CREATE INDEX idx_conversation_events_thread_created
          ON conversation_events(thread_id, created_at, run_id, sequence);

        INSERT INTO conversation_events(
          event_id, thread_id, run_id, sequence, type,
          step_id, block_id, payload_json, created_at
        )
        SELECT
          'migrated_message_' || id,
          thread_id,
          'migrated_run_' || id,
          1,
          CASE role
            WHEN 'user' THEN 'user.message.created'
            ELSE 'assistant.block.completed'
          END,
          CASE role WHEN 'assistant' THEN 'migrated-step' ELSE NULL END,
          CASE role WHEN 'assistant' THEN 'migrated-answer' ELSE NULL END,
          CASE role
            WHEN 'user' THEN json_object('messageId', id, 'content', content)
            ELSE json_object('channel', 'answer', 'content', content)
          END,
          created_at
        FROM messages
        WHERE role IN ('user', 'assistant')
        ORDER BY thread_id, sequence;
      `);
    },
  },
  {
    version: 4,
    up(database) {
      const columns = new Set(
        (database.pragma("table_info(agent_runs)") as { readonly name: string }[])
          .map((column) => column.name),
      );
      if (!columns.has("error_code")) {
        database.exec("ALTER TABLE agent_runs ADD COLUMN error_code TEXT");
      }
      if (!columns.has("error_phase")) {
        database.exec("ALTER TABLE agent_runs ADD COLUMN error_phase TEXT");
      }
      if (!columns.has("error_retryable")) {
        database.exec("ALTER TABLE agent_runs ADD COLUMN error_retryable INTEGER");
      }
    },
  },
];

export default class ProjectDatabase extends SqliteDatabase {
  constructor(databasePath: string) {
    super(databasePath, PROJECT_DATABASE_ID, migrations);
  }
}
