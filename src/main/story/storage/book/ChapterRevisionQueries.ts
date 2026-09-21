import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  countTiptapCharacters,
  extractTiptapText,
  parseTiptapDocument,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  NovelPersistence,
} from "../../application/books/novelPorts.ts";
import type { RevisionRow } from "./rowTypes.ts";
export default class ChapterRevisionQueries {
  constructor(
    private readonly database: BetterSqliteDatabase,
    private readonly deviceId: string,
    private readonly chapter: (id: string) => ChapterRecord,
    private readonly drafts: Pick<NovelPersistence, "getDraft">,
  ) {}
  saveRevision(
    input: Omit<ChapterRevisionRecord, "revisionNumber" | "createdAt"> & {
      readonly expectedCurrentRevisionId: string | null;
      readonly expectedRowVersion?: number;
      readonly expectedDraftVersion?: number;
    },
  ): ChapterRevisionRecord {
    return this.database.transaction(() => {
      const chapter = this.chapter(input.chapterId);
      if (
        (input.expectedRowVersion !== undefined &&
          chapter.rowVersion !== input.expectedRowVersion) ||
        chapter.currentRevisionId !== input.expectedCurrentRevisionId
      ) {
        throw new Error(`Chapter revision conflict: ${input.chapterId}`);
      }
      const next = this.database
        .prepare(
          `
        SELECT COALESCE(MAX(revision_number), 0) + 1 AS revision_number
        FROM chapter_revisions WHERE chapter_id = ?
      `,
        )
        .get(input.chapterId) as { revision_number: number };
      const now = Date.now();
      const document = parseTiptapDocument(input.content);
      const plainText = extractTiptapText(document);
      const documentJson = serializeTiptapDocument(document);
      this.database
        .prepare(
          `INSERT INTO chapter_revisions(
        id,chapter_id,revision_number,parent_revision_id,document_hash,text_hash,extractor_version,
        character_count,origin,device_id,source_run_id,restored_from_revision_id,change_summary,created_at
      ) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?)`,
        )
        .run(
          input.id,
          input.chapterId,
          next.revision_number,
          input.expectedCurrentRevisionId,
          createHash("sha256").update(documentJson).digest("hex"),
          createHash("sha256").update(plainText).digest("hex"),
          countTiptapCharacters(document),
          input.origin ?? "editor",
          this.deviceId,
          input.sourceRunId ?? null,
          input.restoredFromRevisionId ?? null,
          input.changeSummary,
          now,
        );
      this.database
        .prepare(`INSERT INTO revision_documents VALUES (?,1,?,?)`)
        .run(input.id, documentJson, plainText);
      const updated = this.database
        .prepare(
          `
        UPDATE chapters
        SET current_revision_id = ?, updated_at = ?, row_version=row_version+1
        WHERE id = ? AND current_revision_id IS ?
      `,
        )
        .run(input.id, now, input.chapterId, input.expectedCurrentRevisionId);
      if (updated.changes === 0) {
        throw new Error(`Chapter revision conflict: ${input.chapterId}`);
      }
      if (input.expectedDraftVersion !== undefined) {
        const draft = this.drafts.getDraft(input.chapterId);
        if ((draft?.draftVersion ?? 0) !== input.expectedDraftVersion)
          throw new Error("Chapter draft conflict");
        this.database
          .prepare(
            "DELETE FROM chapter_drafts WHERE chapter_id=? AND device_id=? AND draft_version=?",
          )
          .run(input.chapterId, this.deviceId, input.expectedDraftVersion);
      }
      return this.requireRevision(input.id);
    })();
  }

  getRevisionMetadata(revisionId: string): Omit<ChapterRevisionRecord, "content"> | null {
    const row = this.database
      .prepare("SELECT * FROM chapter_revisions WHERE id=?")
      .get(revisionId) as RevisionRow | undefined;
    return row
      ? {
          parentRevisionId: row.parent_revision_id,
          textHash: row.text_hash,
          extractorVersion: row.extractor_version,
          deviceId: row.device_id,
          origin: row.origin,
          ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
          ...(row.restored_from_revision_id
            ? { restoredFromRevisionId: row.restored_from_revision_id }
            : {}),
          id: row.id,
          chapterId: row.chapter_id,
          revisionNumber: row.revision_number,
          contentHash: row.document_hash,
          characterCount: row.character_count,
          changeSummary: row.change_summary,
          createdAt: new Date(row.created_at),
        }
      : null;
  }

  getRevision(revisionId: string): ChapterRevisionRecord | null {
    const row = this.database
      .prepare(
        `
      SELECT r.*, d.document_json AS content FROM chapter_revisions r JOIN revision_documents d ON d.revision_id=r.id WHERE r.id = ?
    `,
      )
      .get(revisionId) as RevisionRow | undefined;
    return row ? this.toRevision(row) : null;
  }

  getRevisionPlainText(revisionId: string): string | null {
    const row = this.database
      .prepare("SELECT plain_text FROM revision_documents WHERE revision_id = ?")
      .get(revisionId) as { plain_text: string } | undefined;
    return row ? row.plain_text : null;
  }

  searchChapterPlainText(
    novelId: string,
    query: string,
    limit: number,
  ): Array<{
    readonly chapterId: string;
    readonly chapterTitle: string;
    readonly occurrence: number;
    readonly snippet: string;
  }> {
    const rows = this.database
      .prepare(
        `
      SELECT c.id, c.title, d.plain_text
      FROM chapters c
      JOIN revision_documents d ON d.revision_id = c.current_revision_id
      WHERE c.book_id = ? AND c.deleted_at IS NULL
        AND (instr(d.plain_text, ?) > 0 OR instr(lower(d.plain_text), lower(?)) > 0)
      ORDER BY c.position, c.id
    `,
      )
      .all(novelId, query, query) as Array<{ id: string; title: string; plain_text: string }>;
    const normalizedQuery = query.toLocaleLowerCase();
    const matches: Array<{
      readonly chapterId: string;
      readonly chapterTitle: string;
      readonly occurrence: number;
      readonly snippet: string;
    }> = [];
    for (const row of rows) {
      const normalizedText = row.plain_text.toLocaleLowerCase();
      let from = 0;
      while (matches.length < limit) {
        const index = normalizedText.indexOf(normalizedQuery, from);
        if (index < 0) break;
        matches.push({
          chapterId: row.id,
          chapterTitle: row.title,
          occurrence: index,
          snippet: row.plain_text.slice(Math.max(0, index - 60), index + query.length + 60),
        });
        from = index + Math.max(1, normalizedQuery.length);
      }
      if (matches.length >= limit) break;
    }
    return matches;
  }

  listRevisions(chapterId: string): Omit<ChapterRevisionRecord, "content">[] {
    return (
      this.database
        .prepare(`SELECT * FROM chapter_revisions WHERE chapter_id=? ORDER BY revision_number DESC`)
        .all(chapterId) as RevisionRow[]
    ).map((row) => ({
      parentRevisionId: row.parent_revision_id,
      textHash: row.text_hash,
      extractorVersion: row.extractor_version,
      deviceId: row.device_id,
      origin: row.origin,
      ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
      ...(row.restored_from_revision_id
        ? { restoredFromRevisionId: row.restored_from_revision_id }
        : {}),
      id: row.id,
      chapterId: row.chapter_id,
      revisionNumber: row.revision_number,
      contentHash: row.document_hash,
      characterCount: row.character_count,
      changeSummary: row.change_summary,
      createdAt: new Date(row.created_at),
    }));
  }

  requireRevision(revisionId: string): ChapterRevisionRecord {
    const revision = this.getRevision(revisionId);
    if (!revision) throw new Error(`Chapter revision not found: ${revisionId}`);
    return revision;
  }

  toRevision(row: RevisionRow): ChapterRevisionRecord {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      revisionNumber: row.revision_number,
      content: row.content,
      contentHash: row.document_hash,
      parentRevisionId: row.parent_revision_id,
      textHash: row.text_hash,
      extractorVersion: row.extractor_version,
      deviceId: row.device_id,
      origin: row.origin,
      ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
      ...(row.restored_from_revision_id
        ? { restoredFromRevisionId: row.restored_from_revision_id }
        : {}),
      characterCount: row.character_count,
      changeSummary: row.change_summary,
      createdAt: new Date(row.created_at),
    };
  }
}
