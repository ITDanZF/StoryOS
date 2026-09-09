import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { ChapterDraft } from "../../../../shared/book/drafts.ts";
import { parseTiptapDocument, serializeTiptapDocument } from "../../../../shared/book/richText.ts";
import type { ChapterRecord } from "../../application/books/novelPorts.ts";
export default class ChapterDraftQueries {
  constructor(
    private readonly database: BetterSqliteDatabase,
    private readonly deviceId: string,
    private readonly chapter: (id: string) => ChapterRecord,
  ) {}
  getDraft(chapterId: string): ChapterDraft | null {
    this.chapter(chapterId);
    const row = this.database
      .prepare("SELECT * FROM chapter_drafts WHERE chapter_id=? AND device_id=?")
      .get(chapterId, this.deviceId) as
      | {
          base_revision_id: string | null;
          draft_version: number;
          document_json: string;
          updated_at: number;
        }
      | undefined;
    return row
      ? {
          chapterId,
          baseRevisionId: row.base_revision_id,
          draftVersion: row.draft_version,
          content: row.document_json,
          updatedAt: new Date(row.updated_at).toISOString(),
        }
      : null;
  }

  saveDraft(input: {
    chapterId: string;
    baseRevisionId: string | null;
    expectedDraftVersion: number;
    content: string;
  }): ChapterDraft {
    return this.database.transaction(() => {
      this.chapter(input.chapterId);
      const current = this.getDraft(input.chapterId);
      if ((current?.draftVersion ?? 0) !== input.expectedDraftVersion)
        throw new Error("草稿已被其他窗口修改，请先保留当前内容再重新载入。");
      const content = serializeTiptapDocument(parseTiptapDocument(input.content));
      this.database
        .prepare(
          `INSERT INTO chapter_drafts VALUES (?,?,?,?,1,?,?) ON CONFLICT(chapter_id,device_id) DO UPDATE SET
        base_revision_id=excluded.base_revision_id,draft_version=excluded.draft_version,document_json=excluded.document_json,updated_at=excluded.updated_at`,
        )
        .run(
          input.chapterId,
          this.deviceId,
          input.baseRevisionId,
          input.expectedDraftVersion + 1,
          content,
          Date.now(),
        );
      const saved = this.getDraft(input.chapterId);
      if (!saved) throw new Error("Saved draft is missing.");
      return saved;
    })();
  }
}
