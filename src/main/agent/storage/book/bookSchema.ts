/** Phase A baseline. Old databases must be explicitly reset, never migrated implicitly. */
export const BOOK_SCHEMA = `
CREATE TABLE books (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, synopsis TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planning','writing','completed','archived')),
 row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version > 0),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX books_singleton ON books((1));
CREATE TABLE volumes (
 id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON UPDATE CASCADE,
 title TEXT NOT NULL, summary TEXT NOT NULL, position INTEGER NOT NULL,
 row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version > 0),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
 UNIQUE(id, book_id)
) STRICT;
CREATE UNIQUE INDEX volumes_position ON volumes(book_id, position) WHERE deleted_at IS NULL;
CREATE TABLE chapters (
 id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON UPDATE CASCADE,
 volume_id TEXT, title TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('outline','draft','revising','completed')),
 position INTEGER NOT NULL, current_revision_id TEXT,
 row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version > 0),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
 FOREIGN KEY(volume_id,book_id) REFERENCES volumes(id,book_id) ON UPDATE CASCADE,
 FOREIGN KEY(current_revision_id,id) REFERENCES chapter_revisions(id,chapter_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE UNIQUE INDEX chapters_unvolumed_position ON chapters(book_id,position) WHERE volume_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX chapters_volume_position ON chapters(volume_id,position) WHERE volume_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX chapters_book ON chapters(book_id,deleted_at,volume_id,position);
CREATE TABLE chapter_revisions (
 id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id),
 revision_number INTEGER NOT NULL CHECK(revision_number > 0), parent_revision_id TEXT,
 document_hash TEXT NOT NULL, text_hash TEXT NOT NULL, extractor_version INTEGER NOT NULL,
 character_count INTEGER NOT NULL CHECK(character_count >= 0),
 origin TEXT NOT NULL CHECK(origin IN ('editor','agent','import','restore')),
 device_id TEXT NOT NULL, source_run_id TEXT, restored_from_revision_id TEXT,
 change_summary TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(chapter_id,revision_number), UNIQUE(id,chapter_id),
 FOREIGN KEY(parent_revision_id,chapter_id) REFERENCES chapter_revisions(id,chapter_id),
 FOREIGN KEY(restored_from_revision_id,chapter_id) REFERENCES chapter_revisions(id,chapter_id)
) STRICT;
CREATE TABLE revision_documents (
 revision_id TEXT PRIMARY KEY REFERENCES chapter_revisions(id),
 document_schema_version INTEGER NOT NULL CHECK(document_schema_version=1),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), plain_text TEXT NOT NULL
) STRICT;
CREATE TRIGGER revisions_immutable BEFORE UPDATE ON chapter_revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
CREATE TRIGGER documents_immutable BEFORE UPDATE ON revision_documents BEGIN SELECT RAISE(ABORT,'Revision documents are immutable'); END;
CREATE TABLE chapter_drafts (
 chapter_id TEXT NOT NULL REFERENCES chapters(id), device_id TEXT NOT NULL,
 base_revision_id TEXT, draft_version INTEGER NOT NULL CHECK(draft_version>0),
 document_schema_version INTEGER NOT NULL CHECK(document_schema_version=1),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), updated_at INTEGER NOT NULL,
 PRIMARY KEY(chapter_id,device_id),
 FOREIGN KEY(base_revision_id,chapter_id) REFERENCES chapter_revisions(id,chapter_id)
) STRICT;
CREATE TABLE book_changes (
 local_sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
 operation_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 entity_version INTEGER NOT NULL, action TEXT NOT NULL,
 payload_version INTEGER NOT NULL CHECK(payload_version=1), payload TEXT NOT NULL CHECK(json_valid(payload)),
 created_at INTEGER NOT NULL, UNIQUE(operation_id,entity_type,entity_id)
) STRICT;
`;

export const BOOK_CHANGE_TRIGGERS = ["books", "volumes", "chapters"]
  .map((table) =>
    ["INSERT", "UPDATE"]
      .map(
        (
          action,
        ) => `CREATE TRIGGER ${table}_${action.toLowerCase()}_change AFTER ${action} ON ${table}
  ${table === "books" ? "" : "WHEN NEW.position > 0"}
  BEGIN
    INSERT INTO book_changes(event_id,operation_id,entity_type,entity_id,entity_version,action,payload_version,payload,created_at)
    VALUES(lower(hex(randomblob(16))),lower(hex(randomblob(16))),'${table}',NEW.id,NEW.row_version,
      '${action.toLowerCase()}',1,json_object('id',NEW.id,'rowVersion',NEW.row_version${table === "chapters" ? ",'bookId',NEW.book_id,'revisionId',NEW.current_revision_id,'volumeId',NEW.volume_id,'position',NEW.position,'deletedAt',NEW.deleted_at" : table === "volumes" ? ",'bookId',NEW.book_id,'position',NEW.position,'deletedAt',NEW.deleted_at" : ",'title',NEW.title,'status',NEW.status"}),NEW.updated_at);
  END;`,
      )
      .join("\n"),
  )
  .join("\n");
