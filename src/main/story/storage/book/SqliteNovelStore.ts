import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { ReaderManifest } from "../../../../shared/book/reader.ts";
import type {
  ChapterRecord,
  ChapterSummaryRecord,
  NovelPersistence,
  NovelRecord,
  VolumeRecord,
} from "../../application/books/novelPorts.ts";
import ChapterDraftQueries from "./ChapterDraftQueries.ts";
import ChapterRevisionQueries from "./ChapterRevisionQueries.ts";
import type { ChapterRow, NovelRow, VolumeRow } from "./rowTypes.ts";

export default class SqliteNovelStore implements NovelPersistence {
  private readonly drafts: ChapterDraftQueries;
  private readonly revisions: ChapterRevisionQueries;

  constructor(
    private readonly database: BetterSqliteDatabase,
    private readonly deviceId = "local",
  ) {
    this.drafts = new ChapterDraftQueries(database, deviceId, (id) => this.requireChapter(id));
    this.revisions = new ChapterRevisionQueries(
      database,
      deviceId,
      (id) => this.requireChapter(id),
      this.drafts,
    );
  }

  readReaderManifest(): ReaderManifest {
    return this.database.transaction(() => {
      const books = this.listNovels();
      if (books.length !== 1) throw new Error("书籍内容不存在或不唯一。");
      const novel = books[0];
      const volumes = this.listVolumes(novel.id);
      const chapters = this.database
        .prepare(
          `SELECT c.id, c.volume_id, c.title, c.position,
        c.current_revision_id, r.document_hash, r.character_count
        FROM chapters c LEFT JOIN chapter_revisions r ON r.id = c.current_revision_id
        WHERE c.book_id = ? AND c.deleted_at IS NULL ORDER BY c.position, c.id`,
        )
        .all(novel.id) as {
        id: string;
        volume_id: string | null;
        title: string;
        position: number;
        current_revision_id: string | null;
        document_hash: string | null;
        character_count: number | null;
      }[];
      return {
        book: {
          ...novel,
          createdAt: novel.createdAt.toISOString(),
          updatedAt: novel.updatedAt.toISOString(),
        },
        volumes: volumes.map((v) => ({
          ...v,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        })),
        chapters: chapters.map((c) => {
          if (c.current_revision_id && c.document_hash === null)
            throw new Error(`章节修订已丢失：${c.title}`);
          if (c.volume_id !== null && !volumes.some((v) => v.id === c.volume_id))
            throw new Error(`章节引用不存在的分卷：${c.title}`);
          return {
            id: c.id,
            volumeId: c.volume_id,
            title: c.title,
            sortOrder: c.position,
            revisionId: c.current_revision_id,
            contentHash: c.document_hash,
            characterCount: c.character_count ?? 0,
          };
        }),
      };
    })();
  }

  createNovel(input: Omit<NovelRecord, "createdAt" | "updatedAt">): NovelRecord {
    const now = Date.now();
    this.database
      .prepare(
        `
      INSERT INTO books(id, title, synopsis, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(input.id, input.title, input.synopsis, input.status, now, now);
    return this.requireNovel(input.id);
  }

  getNovel(novelId: string): NovelRecord | null {
    const row = this.database.prepare("SELECT * FROM books WHERE id = ?").get(novelId) as
      | NovelRow
      | undefined;
    return row ? this.toNovel(row) : null;
  }

  listNovels(): NovelRecord[] {
    return (
      this.database
        .prepare(
          `
      SELECT * FROM books ORDER BY updated_at DESC, id ASC
    `,
        )
        .all() as NovelRow[]
    ).map((row) => this.toNovel(row));
  }

  updateNovel(
    input: Pick<NovelRecord, "id" | "title" | "synopsis" | "status" | "rowVersion">,
  ): NovelRecord {
    const result = this.database
      .prepare(
        `
      UPDATE books
      SET title = ?, synopsis = ?, status = ?, updated_at = ?, row_version=row_version+1
      WHERE id = ? AND row_version = ?
    `,
      )
      .run(input.title, input.synopsis, input.status, Date.now(), input.id, input.rowVersion);
    if (result.changes === 0) throw new Error(`Book metadata version conflict: ${input.id}`);
    return this.requireNovel(input.id);
  }

  deleteNovel(novelId: string): void {
    this.database.transaction(() => {
      this.requireNovel(novelId);
      this.database
        .prepare("UPDATE chapters SET current_revision_id=NULL WHERE book_id=?")
        .run(novelId);
      this.database
        .prepare(
          "DELETE FROM chapter_drafts WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id=?)",
        )
        .run(novelId);
      this.database
        .prepare(
          "DELETE FROM revision_documents WHERE revision_id IN (SELECT r.id FROM chapter_revisions r JOIN chapters c ON c.id=r.chapter_id WHERE c.book_id=?)",
        )
        .run(novelId);
      this.database
        .prepare(
          "DELETE FROM chapter_revisions WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id=?)",
        )
        .run(novelId);
      this.database.prepare("DELETE FROM chapters WHERE book_id=?").run(novelId);
      this.database.prepare("DELETE FROM volumes WHERE book_id=?").run(novelId);
      this.database.prepare("DELETE FROM books WHERE id=?").run(novelId);
      this.database
        .prepare(
          `INSERT INTO book_changes(event_id,operation_id,entity_type,entity_id,entity_version,action,payload_version,payload,created_at)
        VALUES (?,?,'books',?,1,'delete',1,'{}',?)`,
        )
        .run(crypto.randomUUID(), crypto.randomUUID(), novelId, Date.now());
    })();
  }

  createVolume(input: Omit<VolumeRecord, "createdAt" | "updatedAt">): VolumeRecord {
    return this.database.transaction(() => {
      const now = Date.now();
      this.database
        .prepare(
          `
      INSERT INTO volumes(
        id, book_id, title, summary, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        )
        .run(
          input.id,
          input.novelId,
          input.title,
          input.summary,
          this.positionAt("volumes", input.novelId, null, input.id, input.sortOrder),
          now,
          now,
        );
      return this.requireVolume(input.id);
    })();
  }

  listVolumes(novelId: string): VolumeRecord[] {
    return (
      this.database
        .prepare(
          `
      SELECT * FROM volumes
      WHERE book_id = ? AND deleted_at IS NULL
      ORDER BY position ASC, id ASC
    `,
        )
        .all(novelId) as VolumeRow[]
    ).map((row, index) => this.toVolume(row, index));
  }

  updateVolume(
    input: Pick<VolumeRecord, "id" | "title" | "summary" | "sortOrder" | "rowVersion">,
  ): VolumeRecord {
    this.database.transaction(() => {
      const volume = this.requireVolume(input.id);
      if (input.rowVersion !== volume.rowVersion)
        throw new Error("Volume metadata version conflict");
      const position = this.positionAt("volumes", volume.novelId, null, input.id, input.sortOrder);
      this.database
        .prepare(
          `UPDATE volumes SET title=?, summary=?, position=?, row_version=row_version+1, updated_at=? WHERE id=?`,
        )
        .run(input.title, input.summary, position, Date.now(), input.id);
    })();
    return this.requireVolume(input.id);
  }

  deleteVolume(volumeId: string): void {
    this.database.transaction(() => {
      const volume = this.requireVolume(volumeId);
      const children = this.database
        .prepare(
          `SELECT id FROM chapters WHERE volume_id=? AND deleted_at IS NULL ORDER BY position`,
        )
        .all(volumeId) as { id: string }[];
      const last = this.database
        .prepare(
          `SELECT COALESCE(MAX(position),0) AS p FROM chapters WHERE book_id=? AND volume_id IS NULL AND deleted_at IS NULL`,
        )
        .get(volume.novelId) as { p: number };
      children.forEach((child, index) =>
        this.database
          .prepare(
            `UPDATE chapters SET volume_id=NULL,position=?,row_version=row_version+1,updated_at=? WHERE id=?`,
          )
          .run(last.p + (index + 1) * 1024, Date.now(), child.id),
      );
      this.database
        .prepare(
          `UPDATE volumes SET deleted_at=?,updated_at=?,row_version=row_version+1 WHERE id=?`,
        )
        .run(Date.now(), Date.now(), volumeId);
    })();
  }

  createChapter(
    input: Omit<ChapterRecord, "currentRevisionId" | "createdAt" | "updatedAt">,
  ): ChapterRecord {
    this.assertVolumeBelongsToNovel(input.volumeId, input.novelId);
    return this.database.transaction(() => {
      const now = Date.now();
      this.database
        .prepare(
          `
      INSERT INTO chapters(
        id, book_id, volume_id, title, status, position,
        current_revision_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `,
        )
        .run(
          input.id,
          input.novelId,
          input.volumeId,
          input.title,
          input.status,
          this.positionAt("chapters", input.novelId, input.volumeId, input.id, input.sortOrder),
          now,
          now,
        );
      return this.requireChapter(input.id);
    })();
  }

  getChapter(chapterId: string): ChapterRecord | null {
    const row = this.database
      .prepare("SELECT * FROM chapters WHERE id = ? AND deleted_at IS NULL")
      .get(chapterId) as ChapterRow | undefined;
    return row ? this.toChapter(row) : null;
  }

  listChapters(novelId: string): ChapterRecord[] {
    return this.listChapterSummaries(novelId);
  }

  listChapterSummaries(novelId: string): ChapterSummaryRecord[] {
    const rows = this.database
      .prepare(
        `
      SELECT c.*, r.character_count, r.revision_number
      FROM chapters c
      LEFT JOIN volumes v ON v.id=c.volume_id
      LEFT JOIN chapter_revisions r ON r.id=c.current_revision_id
      WHERE c.book_id=? AND c.deleted_at IS NULL
      ORDER BY CASE WHEN c.volume_id IS NULL THEN 0 ELSE 1 END,
        v.position, c.position, c.id
    `,
      )
      .all(novelId) as (ChapterRow & {
      character_count: number | null;
      revision_number: number | null;
    })[];
    const ordinals = new Map<string | null, number>();
    return rows.map((row) => {
      if (row.current_revision_id && row.revision_number === null)
        throw new Error(`Current revision metadata is missing: ${row.id}`);
      const ordinal = ordinals.get(row.volume_id) ?? 0;
      ordinals.set(row.volume_id, ordinal + 1);
      return {
        ...this.toChapter(row, ordinal),
        characterCount: row.character_count ?? 0,
        revisionNumber: row.revision_number,
      };
    });
  }

  updateChapter(
    input: Pick<ChapterRecord, "id" | "volumeId" | "title" | "status" | "sortOrder" | "rowVersion">,
  ): ChapterRecord {
    this.database.transaction(() => {
      const chapter = this.requireChapter(input.id);
      if (input.rowVersion !== chapter.rowVersion)
        throw new Error("Chapter metadata version conflict");
      this.assertVolumeBelongsToNovel(input.volumeId, chapter.novelId);
      const position = this.positionAt(
        "chapters",
        chapter.novelId,
        input.volumeId,
        input.id,
        input.sortOrder,
      );
      this.database
        .prepare(
          `UPDATE chapters SET volume_id=?,title=?,status=?,position=?,row_version=row_version+1,updated_at=? WHERE id=?`,
        )
        .run(input.volumeId, input.title, input.status, position, Date.now(), input.id);
    })();
    return this.requireChapter(input.id);
  }

  deleteChapter(chapterId: string): void {
    this.requireChapter(chapterId);
    this.database
      .prepare(`UPDATE chapters SET deleted_at=?,updated_at=?,row_version=row_version+1 WHERE id=?`)
      .run(Date.now(), Date.now(), chapterId);
  }

  saveRevision(
    ...args: Parameters<ChapterRevisionQueries["saveRevision"]>
  ): ReturnType<ChapterRevisionQueries["saveRevision"]> {
    return this.revisions.saveRevision(...args);
  }

  getRevisionMetadata(
    ...args: Parameters<ChapterRevisionQueries["getRevisionMetadata"]>
  ): ReturnType<ChapterRevisionQueries["getRevisionMetadata"]> {
    return this.revisions.getRevisionMetadata(...args);
  }

  getRevision(
    ...args: Parameters<ChapterRevisionQueries["getRevision"]>
  ): ReturnType<ChapterRevisionQueries["getRevision"]> {
    return this.revisions.getRevision(...args);
  }

  listRevisions(
    ...args: Parameters<ChapterRevisionQueries["listRevisions"]>
  ): ReturnType<ChapterRevisionQueries["listRevisions"]> {
    return this.revisions.listRevisions(...args);
  }

  getDraft(
    ...args: Parameters<ChapterDraftQueries["getDraft"]>
  ): ReturnType<ChapterDraftQueries["getDraft"]> {
    return this.drafts.getDraft(...args);
  }

  saveDraft(
    ...args: Parameters<ChapterDraftQueries["saveDraft"]>
  ): ReturnType<ChapterDraftQueries["saveDraft"]> {
    return this.drafts.saveDraft(...args);
  }

  private siblings(
    table: "volumes" | "chapters",
    bookId: string,
    volumeId: string | null,
  ): { id: string; position: number }[] {
    return this.database
      .prepare(
        `SELECT id,position FROM ${table} WHERE book_id=? AND deleted_at IS NULL ${table === "chapters" ? "AND volume_id IS ?" : ""} ORDER BY position,id`,
      )
      .all(...(table === "chapters" ? [bookId, volumeId] : [bookId])) as {
      id: string;
      position: number;
    }[];
  }

  private ordinal(
    table: "volumes" | "chapters",
    id: string,
    bookId: string,
    volumeId: string | null,
  ): number {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE book_id=? AND deleted_at IS NULL
      ${table === "chapters" ? "AND volume_id IS ?" : ""}
      AND position < (SELECT position FROM ${table} WHERE id=?)`,
      )
      .get(...(table === "chapters" ? [bookId, volumeId, id] : [bookId, id])) as { n: number };
    return row.n;
  }

  private positionAt(
    table: "volumes" | "chapters",
    bookId: string,
    volumeId: string | null,
    id: string,
    ordinal: number,
  ): number {
    let rows = this.siblings(table, bookId, volumeId).filter((row) => row.id !== id);
    const index = Math.min(ordinal, rows.length);
    const gap = () => {
      const left = index === 0 ? 0 : rows[index - 1].position;
      const right = index === rows.length ? left + 2048 : rows[index].position;
      return { left, right };
    };
    let { left, right } = gap();
    if (right - left < 2) {
      // Two phases keep the sibling uniqueness constraint valid during rebalance.
      const all = this.siblings(table, bookId, volumeId);
      all.forEach((row, i) =>
        this.database.prepare(`UPDATE ${table} SET position=? WHERE id=?`).run(-(i + 1), row.id),
      );
      all.forEach((row, i) =>
        this.database
          .prepare(
            `UPDATE ${table} SET position=?,row_version=row_version+1,updated_at=? WHERE id=?`,
          )
          .run((i + 1) * 1024, Date.now(), row.id),
      );
      rows = this.siblings(table, bookId, volumeId).filter((row) => row.id !== id);
      ({ left, right } = gap());
    }
    return Math.floor((left + right) / 2);
  }

  private assertVolumeBelongsToNovel(volumeId: string | null, novelId: string): void {
    if (volumeId === null) return;
    const row = this.database
      .prepare(
        `
      SELECT book_id FROM volumes WHERE id = ? AND deleted_at IS NULL
    `,
      )
      .get(volumeId) as { book_id: string } | undefined;
    if (!row) throw new Error(`Volume not found: ${volumeId}`);
    if (row.book_id !== novelId) {
      throw new Error(`Volume does not belong to novel: ${volumeId}`);
    }
  }

  private requireNovel(novelId: string): NovelRecord {
    const novel = this.getNovel(novelId);
    if (!novel) throw new Error(`Novel not found: ${novelId}`);
    return novel;
  }

  private requireVolume(volumeId: string): VolumeRecord {
    const row = this.database
      .prepare("SELECT * FROM volumes WHERE id = ? AND deleted_at IS NULL")
      .get(volumeId) as VolumeRow | undefined;
    if (!row) throw new Error(`Volume not found: ${volumeId}`);
    return this.toVolume(row);
  }

  private requireChapter(chapterId: string): ChapterRecord {
    const chapter = this.getChapter(chapterId);
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);
    return chapter;
  }

  private toNovel(row: NovelRow): NovelRecord {
    return {
      id: row.id,
      title: row.title,
      synopsis: row.synopsis,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      rowVersion: row.row_version,
    };
  }

  private toVolume(row: VolumeRow, ordinal?: number): VolumeRecord {
    return {
      id: row.id,
      novelId: row.book_id,
      title: row.title,
      summary: row.summary,
      sortOrder: ordinal ?? this.ordinal("volumes", row.id, row.book_id, null),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      rowVersion: row.row_version,
    };
  }

  private toChapter(row: ChapterRow, ordinal?: number): ChapterRecord {
    return {
      id: row.id,
      novelId: row.book_id,
      volumeId: row.volume_id,
      title: row.title,
      status: row.status,
      sortOrder: ordinal ?? this.ordinal("chapters", row.id, row.book_id, row.volume_id),
      currentRevisionId: row.current_revision_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      rowVersion: row.row_version,
    };
  }
}
