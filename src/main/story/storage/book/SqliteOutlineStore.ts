import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  ChapterOutlineMapping,
  NarrativePromise,
  Outline,
  OutlineIssue,
  OutlineNode,
  OutlineNodeParticipant,
  OutlineNodeRelation,
  OutlineSnapshot,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import { issueIsStale } from "../../application/outline/outlineChecks.ts";
import { OutlineNotFound, OutlineRevisionConflict, OutlineValidationError } from "../../application/outline/outlineErrors.ts";

export type StoredChapter = {
  readonly id: string;
  readonly title: string;
  readonly index: number;
  readonly currentRevisionId: string | null;
  readonly plainText: string;
};

type OutlineRow = {
  id: string;
  book_id: string;
  title: string;
  premise: string;
  theme: string;
  core_conflict: string;
  climax_summary: string;
  ending_intent: string;
  status: Outline["status"];
  revision: number;
  created_at: number;
  updated_at: number;
};

export default class SqliteOutlineStore {
  constructor(private readonly database: BetterSqliteDatabase) {}

  requireBookId(): string {
    const rows = this.database.prepare("SELECT id FROM books").all() as { id: string }[];
    if (rows.length !== 1 || !rows[0]) throw new Error("Project book not found.");
    return rows[0].id;
  }

  readActive(): OutlineSnapshot | null {
    const row = this.database
      .prepare("SELECT * FROM outlines WHERE status = 'active' ORDER BY created_at, id LIMIT 1")
      .get() as OutlineRow | undefined;
    if (!row) return null;
    return this.readSnapshot(row);
  }

  createOutline(outline: Outline, root: OutlineNode | null): OutlineSnapshot {
    if (outline.novelId !== this.requireBookId()) throw new OutlineValidationError("引用不存在");
    if (this.readActive()) throw new Error("An active outline already exists.");
    this.database.transaction(() => {
      this.insertOutline(outline);
      if (root) this.insertNode(root);
    })();
    const created = this.readActive();
    if (!created) throw new OutlineNotFound();
    return created;
  }

  updateProfile(outline: Outline, expectedRevision: number): OutlineSnapshot {
    this.database.transaction(() => {
      const current = this.revisionOf(outline.id);
      if (current === null) throw new OutlineNotFound();
      if (current !== expectedRevision) throw new OutlineRevisionConflict(current);
      const result = this.database
        .prepare(
          `UPDATE outlines
           SET title=?, premise=?, theme=?, core_conflict=?, climax_summary=?, ending_intent=?, updated_at=?, revision=revision+1
           WHERE id=? AND revision=? AND status='active'`,
        )
        .run(
          outline.title,
          outline.premise,
          outline.theme,
          outline.coreConflict,
          outline.climaxSummary,
          outline.endingIntent,
          toMillis(outline.updatedAt),
          outline.id,
          expectedRevision,
        );
      if (result.changes !== 1) throw new OutlineRevisionConflict(this.revisionOf(outline.id) ?? expectedRevision);
    })();
    const updated = this.readActive();
    if (!updated) throw new OutlineNotFound();
    return updated;
  }

  commit(snapshot: OutlineSnapshot, expectedRevision: number): OutlineSnapshot {
    this.database.transaction(() => {
      this.database.exec("PRAGMA defer_foreign_keys = ON");
      const current = this.revisionOf(snapshot.outline.id);
      if (current === null) throw new OutlineNotFound();
      if (current !== expectedRevision) throw new OutlineRevisionConflict(current);
      const result = this.database
        .prepare(
          `UPDATE outlines
           SET title=?, premise=?, theme=?, core_conflict=?, climax_summary=?, ending_intent=?, status=?, revision=?, updated_at=?
           WHERE id=? AND revision=?`,
        )
        .run(
          snapshot.outline.title,
          snapshot.outline.premise,
          snapshot.outline.theme,
          snapshot.outline.coreConflict,
          snapshot.outline.climaxSummary,
          snapshot.outline.endingIntent,
          snapshot.outline.status,
          snapshot.outline.revision,
          toMillis(snapshot.outline.updatedAt),
          snapshot.outline.id,
          expectedRevision,
        );
      if (result.changes !== 1 && this.revisionOf(snapshot.outline.id) !== expectedRevision) {
        throw new OutlineRevisionConflict(this.revisionOf(snapshot.outline.id) ?? current);
      }
      this.replaceChildren(snapshot);
    })();
    const saved = this.readActive();
    if (!saved) throw new OutlineNotFound();
    return saved;
  }

  readWaiver(chapterId: string): { readonly waivedOutlineRevision: number | null } | null {
    const row = this.database
      .prepare(
        "SELECT waived_outline_revision AS revision FROM outline_chapter_waivers WHERE chapter_id = ?",
      )
      .get(chapterId) as { revision: number | null } | undefined;
    if (!row) return null;
    return { waivedOutlineRevision: row.revision };
  }

  writeWaiver(chapterId: string, waivedOutlineRevision: number | null): void {
    this.requireOpenChapter(this.requireBookId(), chapterId);
    this.database
      .prepare(
        `INSERT INTO outline_chapter_waivers(chapter_id, waived_outline_revision, created_at)
         VALUES(?, ?, ?)
         ON CONFLICT(chapter_id) DO UPDATE SET waived_outline_revision=excluded.waived_outline_revision, created_at=excluded.created_at`,
      )
      .run(chapterId, waivedOutlineRevision, Date.now());
  }

  foreignNodeIds(outlineId: string): Set<string> {
    const rows = this.database
      .prepare("SELECT id FROM outline_nodes WHERE outline_id <> ?")
      .all(outlineId) as { id: string }[];
    return new Set(rows.map((row) => row.id));
  }

  listReadingChapters(bookId: string): StoredChapter[] {
    const rows = this.database
      .prepare(
        `SELECT c.id AS id, c.title AS title, c.current_revision_id AS revisionId, d.plain_text AS plainText
         FROM chapters c
         LEFT JOIN volumes v ON v.id = c.volume_id
         LEFT JOIN revision_documents d ON d.revision_id = c.current_revision_id
         WHERE c.book_id = ? AND c.deleted_at IS NULL
         ORDER BY CASE WHEN c.volume_id IS NULL THEN 0 ELSE 1 END, COALESCE(v.position, 0), c.position, c.id`,
      )
      .all(bookId) as {
      id: string;
      title: string;
      revisionId: string | null;
      plainText: string | null;
    }[];
    return rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      index,
      currentRevisionId: row.revisionId,
      plainText: row.plainText ?? "",
    }));
  }

  requireOpenChapter(bookId: string, chapterId: string): StoredChapter {
    const chapter = this.listReadingChapters(bookId).find((item) => item.id === chapterId);
    if (!chapter) {
      throw new OutlineValidationError(`Chapter does not belong to the current book: ${chapterId}`);
    }
    return chapter;
  }

  chapterRevisionIds(bookId: string): Map<string, string | null> {
    return new Map(this.listReadingChapters(bookId).map((chapter) => [chapter.id, chapter.currentRevisionId]));
  }

  private readSnapshot(row: OutlineRow): OutlineSnapshot {
    const nodes = this.nodes(row.id);
    const relations = this.relations(row.id);
    const mappings = this.mappings(row.id);
    const participants = this.participants(row.id);
    const promises = this.promises(row.id);
    const storedIssues = this.issues(row.id);
    const snapshot: OutlineSnapshot = {
      outline: this.toOutline(row),
      nodes,
      relations,
      mappings,
      participants,
      promises,
      issues: [],
    };
    const revisions = this.chapterRevisionIds(row.book_id);
    return {
      ...snapshot,
      issues: storedIssues.map((issue) => ({
        ...issue,
        stale: issueIsStale(issue, { ...snapshot, issues: storedIssues }, revisions),
      })),
    };
  }

  private replaceChildren(snapshot: OutlineSnapshot): void {
    const outlineId = snapshot.outline.id;
    this.database.prepare("DELETE FROM outline_issues WHERE outline_id = ?").run(outlineId);
    this.database.prepare("DELETE FROM outline_node_relations WHERE outline_id = ?").run(outlineId);
    this.database
      .prepare(
        "DELETE FROM outline_node_participants WHERE node_id IN (SELECT id FROM outline_nodes WHERE outline_id = ?)",
      )
      .run(outlineId);
    this.database
      .prepare(
        "DELETE FROM outline_node_chapters WHERE node_id IN (SELECT id FROM outline_nodes WHERE outline_id = ?)",
      )
      .run(outlineId);
    this.database.prepare("DELETE FROM narrative_promises WHERE outline_id = ?").run(outlineId);
    this.database.prepare("DELETE FROM outline_nodes WHERE outline_id = ?").run(outlineId);
    for (const node of parentsFirst(snapshot.nodes)) this.insertNode(node);
    for (const relation of snapshot.relations) this.insertRelation(relation);
    for (const participant of snapshot.participants) this.insertParticipant(participant);
    for (const mapping of snapshot.mappings) this.insertMapping(mapping);
    for (const promise of snapshot.promises) this.insertPromise(promise);
    for (const issue of snapshot.issues) this.insertIssue(issue);
  }

  private insertOutline(outline: Outline): void {
    this.database
      .prepare(
        `INSERT INTO outlines(
          id, book_id, title, premise, theme, core_conflict, climax_summary, ending_intent, status, revision, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        outline.id,
        outline.novelId,
        outline.title,
        outline.premise,
        outline.theme,
        outline.coreConflict,
        outline.climaxSummary,
        outline.endingIntent,
        outline.status,
        outline.revision,
        toMillis(outline.createdAt),
        toMillis(outline.updatedAt),
      );
  }

  private insertNode(node: OutlineNode): void {
    this.database
      .prepare(
        `INSERT INTO outline_nodes(
          id, outline_id, parent_id, kind, title, summary, structural_role, narrative_function,
          goal, conflict, outcome, location_text, time_text, story_order, narrative_order,
          status, notes, revision, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        node.id,
        node.outlineId,
        node.parentId,
        node.kind,
        node.title,
        node.summary,
        node.structuralRole,
        node.narrativeFunction,
        node.goal,
        node.conflict,
        node.outcome,
        node.locationText,
        node.timeText,
        node.storyOrder,
        node.narrativeOrder,
        node.status,
        node.notes,
        node.revision,
        toMillis(node.createdAt),
        toMillis(node.updatedAt),
      );
  }

  private insertRelation(relation: OutlineNodeRelation): void {
    this.database
      .prepare(
        `INSERT INTO outline_node_relations(
          id, outline_id, source_node_id, target_node_id, type, description, order_exception, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        relation.id,
        relation.outlineId,
        relation.sourceNodeId,
        relation.targetNodeId,
        relation.type,
        relation.description,
        relation.orderException ? 1 : 0,
        toMillis(relation.createdAt),
      );
  }

  private insertParticipant(participant: OutlineNodeParticipant): void {
    this.database
      .prepare(
        `INSERT INTO outline_node_participants(node_id, participant_name, role, state_before, state_after)
         VALUES(?, ?, ?, ?, ?)`,
      )
      .run(
        participant.nodeId,
        participant.participantName,
        participant.role,
        participant.stateBefore,
        participant.stateAfter,
      );
  }

  private insertMapping(mapping: ChapterOutlineMapping): void {
    this.database
      .prepare(
        `INSERT INTO outline_node_chapters(
          chapter_id, node_id, sort_order, coverage_status, coverage_note,
          verification_outline_revision, verification_chapter_revision_id
        ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mapping.chapterId,
        mapping.nodeId,
        mapping.sortOrder,
        mapping.coverageStatus,
        mapping.coverageNote,
        mapping.verificationOutlineRevision,
        mapping.verificationChapterRevisionId,
      );
  }

  private insertPromise(promise: NarrativePromise): void {
    this.database
      .prepare(
        `INSERT INTO narrative_promises(
          id, outline_id, title, setup, trigger_condition, payoff_requirement, status,
          setup_node_id, trigger_node_id, payoff_node_id, notes, status_reason, revision, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        promise.id,
        promise.outlineId,
        promise.title,
        promise.setup,
        promise.triggerCondition,
        promise.payoffRequirement,
        promise.status,
        promise.setupNodeId,
        promise.triggerNodeId,
        promise.payoffNodeId,
        promise.notes,
        promise.statusReason,
        promise.revision,
        toMillis(promise.createdAt),
        toMillis(promise.updatedAt),
      );
  }

  private insertIssue(issue: OutlineIssue): void {
    this.database
      .prepare(
        `INSERT INTO outline_issues(
          id, outline_id, node_id, rule_code, severity, source, message, fingerprint, status, checked_revision, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        issue.id,
        issue.outlineId,
        issue.nodeId,
        issue.ruleCode,
        issue.severity,
        issue.source,
        issue.message,
        issue.fingerprint,
        issue.status,
        issue.checkedRevision,
        Date.now(),
      );
  }

  private revisionOf(outlineId: string): number | null {
    const row = this.database.prepare("SELECT revision FROM outlines WHERE id = ?").get(outlineId) as
      | { revision: number }
      | undefined;
    return row?.revision ?? null;
  }

  private toOutline(row: OutlineRow): Outline {
    return {
      id: row.id,
      novelId: row.book_id,
      title: row.title,
      premise: row.premise,
      theme: row.theme,
      coreConflict: row.core_conflict,
      climaxSummary: row.climax_summary,
      endingIntent: row.ending_intent,
      status: row.status,
      revision: row.revision,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private nodes(outlineId: string): OutlineNode[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM outline_nodes WHERE outline_id = ? ORDER BY narrative_order, id",
      )
      .all(outlineId) as Record<string, string | number | null>[];
    return rows.map((row) => ({
      id: String(row.id),
      outlineId: String(row.outline_id),
      parentId: row.parent_id === null ? null : String(row.parent_id),
      kind: row.kind as OutlineNode["kind"],
      title: String(row.title),
      summary: String(row.summary),
      structuralRole: row.structural_role as OutlineNode["structuralRole"],
      narrativeFunction: row.narrative_function as OutlineNode["narrativeFunction"],
      goal: String(row.goal),
      conflict: String(row.conflict),
      outcome: String(row.outcome),
      locationText: String(row.location_text),
      timeText: String(row.time_text),
      storyOrder: Number(row.story_order),
      narrativeOrder: Number(row.narrative_order),
      status: row.status as OutlineNode["status"],
      notes: String(row.notes),
      revision: Number(row.revision),
      createdAt: new Date(Number(row.created_at)).toISOString(),
      updatedAt: new Date(Number(row.updated_at)).toISOString(),
    }));
  }

  private relations(outlineId: string): OutlineNodeRelation[] {
    const rows = this.database
      .prepare("SELECT * FROM outline_node_relations WHERE outline_id = ? ORDER BY id")
      .all(outlineId) as Record<string, string | number>[];
    return rows.map((row) => ({
      id: String(row.id),
      outlineId: String(row.outline_id),
      sourceNodeId: String(row.source_node_id),
      targetNodeId: String(row.target_node_id),
      type: row.type as OutlineNodeRelation["type"],
      description: String(row.description),
      orderException: Number(row.order_exception) === 1,
      createdAt: new Date(Number(row.created_at)).toISOString(),
    }));
  }

  private mappings(outlineId: string): ChapterOutlineMapping[] {
    const rows = this.database
      .prepare(
        `SELECT m.* FROM outline_node_chapters m
         JOIN outline_nodes n ON n.id = m.node_id
         WHERE n.outline_id = ?
         ORDER BY m.sort_order, m.node_id`,
      )
      .all(outlineId) as Record<string, string | number | null>[];
    return rows.map((row) => ({
      chapterId: String(row.chapter_id),
      nodeId: String(row.node_id),
      sortOrder: Number(row.sort_order),
      coverageStatus: row.coverage_status as ChapterOutlineMapping["coverageStatus"],
      coverageNote: String(row.coverage_note),
      verificationOutlineRevision:
        row.verification_outline_revision === null ? null : Number(row.verification_outline_revision),
      verificationChapterRevisionId:
        row.verification_chapter_revision_id === null ? null : String(row.verification_chapter_revision_id),
    }));
  }

  private participants(outlineId: string): OutlineNodeParticipant[] {
    const rows = this.database
      .prepare(
        `SELECT p.* FROM outline_node_participants p
         JOIN outline_nodes n ON n.id = p.node_id
         WHERE n.outline_id = ?
         ORDER BY p.node_id, p.participant_name`,
      )
      .all(outlineId) as Record<string, string>[];
    return rows.map((row) => ({
      nodeId: row.node_id,
      participantName: row.participant_name,
      role: row.role as OutlineNodeParticipant["role"],
      stateBefore: row.state_before,
      stateAfter: row.state_after,
    }));
  }

  private promises(outlineId: string): NarrativePromise[] {
    const rows = this.database
      .prepare("SELECT * FROM narrative_promises WHERE outline_id = ? ORDER BY created_at, id")
      .all(outlineId) as Record<string, string | number | null>[];
    return rows.map((row) => ({
      id: String(row.id),
      outlineId: String(row.outline_id),
      title: String(row.title),
      setup: String(row.setup),
      triggerCondition: String(row.trigger_condition),
      payoffRequirement: String(row.payoff_requirement),
      status: row.status as NarrativePromise["status"],
      setupNodeId: row.setup_node_id === null ? null : String(row.setup_node_id),
      triggerNodeId: row.trigger_node_id === null ? null : String(row.trigger_node_id),
      payoffNodeId: row.payoff_node_id === null ? null : String(row.payoff_node_id),
      notes: String(row.notes),
      statusReason: String(row.status_reason),
      revision: Number(row.revision),
      createdAt: new Date(Number(row.created_at)).toISOString(),
      updatedAt: new Date(Number(row.updated_at)).toISOString(),
    }));
  }

  private issues(outlineId: string): OutlineIssue[] {
    const rows = this.database
      .prepare("SELECT * FROM outline_issues WHERE outline_id = ? ORDER BY created_at, id")
      .all(outlineId) as Record<string, string | number | null>[];
    return rows.map((row) => ({
      id: String(row.id),
      outlineId: String(row.outline_id),
      nodeId: row.node_id === null ? null : String(row.node_id),
      ruleCode: String(row.rule_code),
      severity: row.severity as OutlineIssue["severity"],
      source: row.source as OutlineIssue["source"],
      message: String(row.message),
      fingerprint: String(row.fingerprint),
      status: row.status as OutlineIssue["status"],
      checkedRevision: Number(row.checked_revision),
      stale: false,
    }));
  }
}

function toMillis(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new OutlineValidationError("时间格式非法");
  return parsed;
}

function leavesFirst(nodes: readonly OutlineNode[]): OutlineNode[] {
  const remaining = [...nodes];
  const ordered: OutlineNode[] = [];
  while (remaining.length > 0) {
    const leaves = remaining.filter((node) => !remaining.some((other) => other.parentId === node.id));
    if (leaves.length === 0) {
      ordered.push(...remaining);
      break;
    }
    ordered.push(...leaves);
    const ids = new Set(leaves.map((node) => node.id));
    remaining.splice(
      0,
      remaining.length,
      ...remaining.filter((node) => !ids.has(node.id)),
    );
  }
  return ordered;
}

function parentsFirst(nodes: readonly OutlineNode[]): OutlineNode[] {
  return [...leavesFirst(nodes)].reverse();
}
