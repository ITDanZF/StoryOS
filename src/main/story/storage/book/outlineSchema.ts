export const OUTLINE_SCHEMA = `
CREATE TABLE outlines (
 id TEXT PRIMARY KEY,
 book_id TEXT NOT NULL REFERENCES books(id) ON UPDATE CASCADE,
 title TEXT NOT NULL,
 premise TEXT NOT NULL,
 theme TEXT NOT NULL,
 core_conflict TEXT NOT NULL,
 climax_summary TEXT NOT NULL,
 ending_intent TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','active','archived')),
 revision INTEGER NOT NULL CHECK(revision > 0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX outlines_one_active ON outlines(book_id) WHERE status = 'active';
CREATE TABLE outline_nodes (
 id TEXT PRIMARY KEY,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 parent_id TEXT REFERENCES outline_nodes(id) DEFERRABLE INITIALLY DEFERRED,
 kind TEXT NOT NULL CHECK(kind IN ('arc','beat','scene','event')),
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 structural_role TEXT NOT NULL CHECK(structural_role IN (
  'setup','inciting_incident','rising_action','turning_point','crisis','climax','falling_action','resolution','custom')),
 narrative_function TEXT NOT NULL CHECK(narrative_function IN (
  'action','dialogue','exposition','worldbuilding','relationship','mystery','transition','mixed')),
 goal TEXT NOT NULL,
 conflict TEXT NOT NULL,
 outcome TEXT NOT NULL,
 location_text TEXT NOT NULL,
 time_text TEXT NOT NULL,
 story_order INTEGER NOT NULL,
 narrative_order INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','confirmed','writing','covered','needs_revision')),
 notes TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX outline_nodes_tree ON outline_nodes(outline_id, parent_id, narrative_order);
CREATE TABLE outline_node_relations (
 id TEXT PRIMARY KEY,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 source_node_id TEXT NOT NULL REFERENCES outline_nodes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 target_node_id TEXT NOT NULL REFERENCES outline_nodes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 type TEXT NOT NULL CHECK(type IN ('causes','requires','reveals','foreshadows','contrasts')),
 description TEXT NOT NULL,
 order_exception INTEGER NOT NULL CHECK(order_exception IN (0,1)),
 created_at INTEGER NOT NULL,
 UNIQUE(source_node_id, target_node_id, type),
 CHECK(source_node_id <> target_node_id)
) STRICT;
CREATE TABLE outline_node_chapters (
 chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
 node_id TEXT NOT NULL UNIQUE REFERENCES outline_nodes(id) ON DELETE CASCADE,
 sort_order INTEGER NOT NULL,
 coverage_status TEXT NOT NULL CHECK(coverage_status IN ('planned','drafted','verified','deviated')),
 coverage_note TEXT NOT NULL,
 verification_outline_revision INTEGER,
 verification_chapter_revision_id TEXT,
 PRIMARY KEY(chapter_id, node_id)
) STRICT;
CREATE TABLE outline_node_participants (
 node_id TEXT NOT NULL REFERENCES outline_nodes(id) ON DELETE CASCADE,
 participant_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('focus','active','supporting','mentioned')),
 state_before TEXT NOT NULL,
 state_after TEXT NOT NULL,
 PRIMARY KEY(node_id, participant_name)
) STRICT;
CREATE TABLE narrative_promises (
 id TEXT PRIMARY KEY,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 setup TEXT NOT NULL,
 trigger_condition TEXT NOT NULL,
 payoff_requirement TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planned','seeded','eligible','paid_off','abandoned')),
 setup_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
 trigger_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
 payoff_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
 notes TEXT NOT NULL,
 status_reason TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE outline_issues (
 id TEXT PRIMARY KEY,
 outline_id TEXT NOT NULL REFERENCES outlines(id) ON DELETE CASCADE,
 node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
 rule_code TEXT NOT NULL,
 severity TEXT NOT NULL CHECK(severity IN ('info','warning','error')),
 source TEXT NOT NULL CHECK(source IN ('rule','ai')),
 message TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('open','ignored','resolved')),
 checked_revision INTEGER NOT NULL,
 created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE outline_chapter_waivers (
 chapter_id TEXT PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
 waived_outline_revision INTEGER,
 created_at INTEGER NOT NULL
) STRICT;
`;
