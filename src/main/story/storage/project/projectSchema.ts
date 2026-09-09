export const PROJECT_SCHEMA = `
CREATE TABLE threads (
 id TEXT PRIMARY KEY,title TEXT NOT NULL,book_id TEXT,row_version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,archived_at INTEGER
) STRICT;
CREATE INDEX threads_recent ON threads(updated_at DESC,id) WHERE archived_at IS NULL;
CREATE TABLE workspace_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),workspace_id TEXT NOT NULL,
 active_thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,updated_at INTEGER NOT NULL
) STRICT;
INSERT INTO workspace_state VALUES (1,lower(hex(randomblob(16))),NULL,0);
CREATE TABLE thread_skills (
 thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,skill_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','disabled')),PRIMARY KEY(thread_id,skill_id)
) STRICT;
CREATE TABLE agent_runs (
 id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
 parent_run_id TEXT REFERENCES agent_runs(id),book_id TEXT,chapter_id TEXT,base_revision_id TEXT,
 operation TEXT NOT NULL DEFAULT 'conversation',provider_key TEXT,model_key TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','cancelling','completed','aborted','timed_out','failed')),
 started_at INTEGER NOT NULL,completed_at INTEGER,duration_ms INTEGER,output TEXT,
 error_name TEXT,error_code TEXT,error_phase TEXT,error_message TEXT,error_retryable INTEGER,
 created_at INTEGER NOT NULL,UNIQUE(id,thread_id)
) STRICT;
CREATE INDEX runs_thread ON agent_runs(thread_id,created_at DESC,id);
CREATE INDEX runs_status ON agent_runs(status,created_at DESC,id);
CREATE TABLE conversation_events (
 local_sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,
 thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
 thread_sequence INTEGER NOT NULL,run_id TEXT,run_sequence INTEGER,
 type TEXT NOT NULL,schema_version INTEGER NOT NULL CHECK(schema_version=1),step_id TEXT,block_id TEXT,
 payload TEXT NOT NULL CHECK(json_valid(payload)),created_at INTEGER NOT NULL,
 UNIQUE(thread_id,thread_sequence),UNIQUE(run_id,run_sequence),
 CHECK((run_id IS NULL)=(run_sequence IS NULL)),
 FOREIGN KEY(run_id,thread_id) REFERENCES agent_runs(id,thread_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE message_views (
 id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
 first_sequence INTEGER NOT NULL,last_sequence INTEGER NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
 status TEXT NOT NULL CHECK(status IN ('streaming','completed','failed')),
 blocks TEXT NOT NULL CHECK(json_valid(blocks)),updated_at INTEGER NOT NULL,
 UNIQUE(thread_id,first_sequence)
) STRICT;
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

`;
