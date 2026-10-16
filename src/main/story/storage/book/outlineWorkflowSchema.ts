export const OUTLINE_WORKFLOW_SCHEMA = `
CREATE TABLE outline_backfill_scans (
 id TEXT PRIMARY KEY,
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 outline_revision INTEGER NOT NULL,
 extractor_version TEXT NOT NULL,
 chapter_inputs_json TEXT NOT NULL,
 completed_chapter_ids_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('scanning','ready','failed','stale','cancelled')),
 created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX outline_backfill_scans_book ON outline_backfill_scans(book_id, created_at DESC);
CREATE TABLE outline_backfill_candidates (
 scan_id TEXT NOT NULL REFERENCES outline_backfill_scans(id) ON DELETE CASCADE,
 candidate_id TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 accepted_node_id TEXT,
 PRIMARY KEY(scan_id, candidate_id)
) STRICT;
CREATE TABLE outline_backfill_evidence (
 id TEXT PRIMARY KEY,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 node_id TEXT NOT NULL,
 chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL,
 start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
 end_offset INTEGER NOT NULL CHECK(end_offset > start_offset),
 excerpt TEXT NOT NULL
) STRICT;
CREATE INDEX outline_backfill_evidence_node ON outline_backfill_evidence(node_id, chapter_id);
CREATE TABLE graph_writing_plans (
 id TEXT PRIMARY KEY,
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 payload_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX graph_writing_plans_book ON graph_writing_plans(book_id, updated_at DESC);
CREATE UNIQUE INDEX graph_writing_source_run ON chapter_revisions(source_run_id) WHERE source_run_id IS NOT NULL;
`;
