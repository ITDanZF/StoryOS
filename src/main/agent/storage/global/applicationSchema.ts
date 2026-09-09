export const APPLICATION_SCHEMA = `
CREATE TABLE projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, local_path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE,
 location_type TEXT NOT NULL CHECK(location_type IN ('created','linked')),
 trusted INTEGER NOT NULL CHECK(trusted IN (0,1)), row_version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_opened_at INTEGER NOT NULL
) STRICT;
CREATE INDEX projects_recent ON projects(last_opened_at DESC,id);
CREATE TABLE book_registry (
 book_id TEXT PRIMARY KEY, local_path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('available','missing','importing','trashed','corrupted')),
 source_generation TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_opened_at INTEGER, trashed_at INTEGER,
 CHECK((state='trashed')=(trashed_at IS NOT NULL))
) STRICT;
CREATE INDEX registry_recent ON book_registry(state,COALESCE(last_opened_at,updated_at) DESC,book_id);
CREATE TABLE project_books (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 book_id TEXT NOT NULL UNIQUE REFERENCES book_registry(book_id) ON DELETE RESTRICT,
 attached_at INTEGER NOT NULL
) STRICT;
CREATE TABLE app_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 active_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 device_id TEXT NOT NULL, local_profile_id TEXT NOT NULL,
 preferences_version INTEGER NOT NULL CHECK(preferences_version=1),
 preferences TEXT NOT NULL CHECK(json_valid(preferences))
) STRICT;
INSERT INTO app_state VALUES (1,NULL,lower(hex(randomblob(16))),lower(hex(randomblob(16))),1,'{}');
CREATE TABLE book_catalog (
 book_id TEXT PRIMARY KEY REFERENCES book_registry(book_id) ON DELETE CASCADE,
 title TEXT NOT NULL, synopsis TEXT NOT NULL, writing_status TEXT NOT NULL,
 volume_count INTEGER NOT NULL CHECK(volume_count>=0), chapter_count INTEGER NOT NULL CHECK(chapter_count>=0),
 character_count INTEGER NOT NULL CHECK(character_count>=0), content_updated_at INTEGER NOT NULL,
 source_generation TEXT NOT NULL, source_sequence INTEGER NOT NULL, refreshed_at INTEGER NOT NULL
) STRICT;
CREATE INDEX catalog_recent ON book_catalog(content_updated_at DESC,book_id);
CREATE INDEX catalog_status ON book_catalog(writing_status,content_updated_at DESC,book_id);
CREATE TABLE reading_states (
 book_id TEXT NOT NULL REFERENCES book_registry(book_id) ON DELETE CASCADE,
 profile_id TEXT NOT NULL, device_id TEXT NOT NULL, state_version INTEGER NOT NULL CHECK(state_version>0),
 anchor_version INTEGER NOT NULL CHECK(anchor_version=1), anchor TEXT NOT NULL CHECK(json_valid(anchor)),
 preferences_version INTEGER NOT NULL CHECK(preferences_version=1), preferences TEXT NOT NULL CHECK(json_valid(preferences)),
 updated_at INTEGER NOT NULL, PRIMARY KEY(book_id,profile_id,device_id)
) STRICT;
CREATE TABLE archives (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'project' CHECK(kind='project'),
 source_project_id TEXT, source_book_id TEXT, local_path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE,
 format_version INTEGER NOT NULL, manifest_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('creating','available','corrupted','restored')),
 created_at INTEGER NOT NULL, last_restored_at INTEGER
) STRICT;
CREATE INDEX archives_project ON archives(source_project_id,created_at DESC,id);
CREATE INDEX archives_book ON archives(source_book_id,created_at DESC,id);
CREATE TABLE storage_operations (
 id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('archive_restore','book_cleanup')),
 state TEXT NOT NULL CHECK(state IN ('queued','running','completed','failed','cancelled')),
 phase TEXT NOT NULL, book_id TEXT, project_id TEXT,
 archive_id TEXT REFERENCES archives(id) ON DELETE RESTRICT,
 attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt>0), error_code TEXT, error_message TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX operations_pending ON storage_operations(state,updated_at,id);
CREATE INDEX operations_book ON storage_operations(book_id,created_at DESC);
CREATE TABLE archive_restore_details (
 operation_id TEXT PRIMARY KEY REFERENCES storage_operations(id) ON DELETE CASCADE,
 archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE RESTRICT,
 target_path TEXT NOT NULL, book_strategy TEXT NOT NULL CHECK(book_strategy IN ('snapshot','current')),
 restored_book_id TEXT, published_marker TEXT NOT NULL, details_version INTEGER NOT NULL CHECK(details_version=1)
) STRICT;
CREATE TABLE book_cleanup_details (
 operation_id TEXT PRIMARY KEY REFERENCES storage_operations(id) ON DELETE CASCADE,
 book_id TEXT NOT NULL, staging_path TEXT NOT NULL,
 cleanup_state TEXT NOT NULL CHECK(cleanup_state IN ('pending','completed','failed')),
 cleanup_updated_at INTEGER NOT NULL, ownership_marker TEXT NOT NULL
) STRICT;
CREATE TABLE projection_cursors (
 consumer TEXT NOT NULL, book_id TEXT NOT NULL REFERENCES book_registry(book_id) ON DELETE CASCADE,
 source_generation TEXT NOT NULL, last_sequence INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(consumer,book_id)
) STRICT;
`;
