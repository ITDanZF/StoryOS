import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  ChapterStatus,
  NovelPersistence,
  NovelRecord,
  NovelStatus,
  VolumeRecord,
} from "../../application/novelPorts.ts";

type NovelRow = {
  id: string;
  title: string;
  synopsis: string;
  status: NovelStatus;
  created_at: number;
  updated_at: number;
};

type VolumeRow = {
  id: string;
  novel_id: string;
  title: string;
  summary: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

type ChapterRow = {
  id: string;
  novel_id: string;
  volume_id: string | null;
  title: string;
  status: ChapterStatus;
  sort_order: number;
  current_revision_id: string | null;
  created_at: number;
  updated_at: number;
};

type RevisionRow = {
  id: string;
  chapter_id: string;
  revision_number: number;
  content: string;
  content_hash: string;
  character_count: number;
  change_summary: string;
  created_at: number;
};

export default class SqliteNovelStore implements NovelPersistence {
  constructor(private readonly database: BetterSqliteDatabase) {}

  createNovel(
    input: Omit<NovelRecord, "createdAt" | "updatedAt">,
  ): NovelRecord {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO novels(id, title, synopsis, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.id, input.title, input.synopsis, input.status, now, now);
    return this.requireNovel(input.id);
  }

  getNovel(novelId: string): NovelRecord | null {
    const row = this.database.prepare("SELECT * FROM novels WHERE id = ?")
      .get(novelId) as NovelRow | undefined;
    return row ? this.toNovel(row) : null;
  }

  listNovels(): NovelRecord[] {
    return (this.database.prepare(`
      SELECT * FROM novels ORDER BY updated_at DESC, id ASC
    `).all() as NovelRow[]).map((row) => this.toNovel(row));
  }

  updateNovel(
    input: Pick<NovelRecord, "id" | "title" | "synopsis" | "status">,
  ): NovelRecord {
    const result = this.database.prepare(`
      UPDATE novels
      SET title = ?, synopsis = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(input.title, input.synopsis, input.status, Date.now(), input.id);
    if (result.changes === 0) throw new Error(`Novel not found: ${input.id}`);
    return this.requireNovel(input.id);
  }

  deleteNovel(novelId: string): void {
    const result = this.database.prepare("DELETE FROM novels WHERE id = ?")
      .run(novelId);
    if (result.changes === 0) throw new Error(`Novel not found: ${novelId}`);
  }

  createVolume(
    input: Omit<VolumeRecord, "createdAt" | "updatedAt">,
  ): VolumeRecord {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO volumes(
        id, novel_id, title, summary, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.novelId,
      input.title,
      input.summary,
      input.sortOrder,
      now,
      now,
    );
    return this.requireVolume(input.id);
  }

  listVolumes(novelId: string): VolumeRecord[] {
    return (this.database.prepare(`
      SELECT * FROM volumes
      WHERE novel_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(novelId) as VolumeRow[]).map((row) => this.toVolume(row));
  }

  deleteVolume(volumeId: string): void {
    this.database.transaction(() => {
      this.requireVolume(volumeId);
      const now = Date.now();
      this.database.prepare(`
        UPDATE chapters
        SET volume_id = NULL, updated_at = ?
        WHERE volume_id = ?
      `).run(now, volumeId);
      const result = this.database.prepare(
        "DELETE FROM volumes WHERE id = ?",
      ).run(volumeId);
      if (result.changes === 0) {
        throw new Error(`Volume not found: ${volumeId}`);
      }
    })();
  }

  createChapter(
    input: Omit<
      ChapterRecord,
      "currentRevisionId" | "createdAt" | "updatedAt"
    >,
  ): ChapterRecord {
    this.assertVolumeBelongsToNovel(input.volumeId, input.novelId);
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO chapters(
        id, novel_id, volume_id, title, status, sort_order,
        current_revision_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      input.id,
      input.novelId,
      input.volumeId,
      input.title,
      input.status,
      input.sortOrder,
      now,
      now,
    );
    return this.requireChapter(input.id);
  }

  getChapter(chapterId: string): ChapterRecord | null {
    const row = this.database.prepare("SELECT * FROM chapters WHERE id = ?")
      .get(chapterId) as ChapterRow | undefined;
    return row ? this.toChapter(row) : null;
  }

  listChapters(novelId: string): ChapterRecord[] {
    return (this.database.prepare(`
      SELECT chapters.*
      FROM chapters
      LEFT JOIN volumes ON volumes.id = chapters.volume_id
      WHERE chapters.novel_id = ?
      ORDER BY
        CASE WHEN chapters.volume_id IS NULL THEN 0 ELSE 1 END,
        volumes.sort_order ASC,
        chapters.sort_order ASC,
        chapters.id ASC
    `).all(novelId) as ChapterRow[]).map((row) => this.toChapter(row));
  }

  updateChapter(
    input: Pick<
      ChapterRecord,
      "id" | "volumeId" | "title" | "status" | "sortOrder"
    >,
  ): ChapterRecord {
    const chapter = this.requireChapter(input.id);
    this.assertVolumeBelongsToNovel(input.volumeId, chapter.novelId);
    const result = this.database.prepare(`
      UPDATE chapters
      SET volume_id = ?, title = ?, status = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.volumeId,
      input.title,
      input.status,
      input.sortOrder,
      Date.now(),
      input.id,
    );
    if (result.changes === 0) throw new Error(`Chapter not found: ${input.id}`);
    return this.requireChapter(input.id);
  }

  deleteChapter(chapterId: string): void {
    const result = this.database.prepare(
      "DELETE FROM chapters WHERE id = ?",
    ).run(chapterId);
    if (result.changes === 0) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
  }

  saveRevision(
    input: Omit<ChapterRevisionRecord, "revisionNumber" | "createdAt"> & {
      readonly expectedCurrentRevisionId: string | null;
    },
  ): ChapterRevisionRecord {
    return this.database.transaction(() => {
      const chapter = this.requireChapter(input.chapterId);
      if (chapter.currentRevisionId !== input.expectedCurrentRevisionId) {
        throw new Error(`Chapter revision conflict: ${input.chapterId}`);
      }
      const next = this.database.prepare(`
        SELECT COALESCE(MAX(revision_number), 0) + 1 AS revision_number
        FROM chapter_revisions WHERE chapter_id = ?
      `).get(input.chapterId) as { revision_number: number };
      const now = Date.now();
      this.database.prepare(`
        INSERT INTO chapter_revisions(
          id, chapter_id, revision_number, content, content_hash,
          character_count, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.id,
        input.chapterId,
        next.revision_number,
        input.content,
        input.contentHash,
        input.characterCount,
        input.changeSummary,
        now,
      );
      const updated = this.database.prepare(`
        UPDATE chapters
        SET current_revision_id = ?, updated_at = ?
        WHERE id = ? AND current_revision_id IS ?
      `).run(
        input.id,
        now,
        input.chapterId,
        input.expectedCurrentRevisionId,
      );
      if (updated.changes === 0) {
        throw new Error(`Chapter revision conflict: ${input.chapterId}`);
      }
      return this.requireRevision(input.id);
    })();
  }

  getRevision(revisionId: string): ChapterRevisionRecord | null {
    const row = this.database.prepare(`
      SELECT * FROM chapter_revisions WHERE id = ?
    `).get(revisionId) as RevisionRow | undefined;
    return row ? this.toRevision(row) : null;
  }

  listRevisions(chapterId: string): ChapterRevisionRecord[] {
    return (this.database.prepare(`
      SELECT * FROM chapter_revisions
      WHERE chapter_id = ?
      ORDER BY revision_number DESC
    `).all(chapterId) as RevisionRow[])
      .map((row) => this.toRevision(row));
  }

  private assertVolumeBelongsToNovel(
    volumeId: string | null,
    novelId: string,
  ): void {
    if (volumeId === null) return;
    const row = this.database.prepare(`
      SELECT novel_id FROM volumes WHERE id = ?
    `).get(volumeId) as { novel_id: string } | undefined;
    if (!row) throw new Error(`Volume not found: ${volumeId}`);
    if (row.novel_id !== novelId) {
      throw new Error(`Volume does not belong to novel: ${volumeId}`);
    }
  }

  private requireNovel(novelId: string): NovelRecord {
    const novel = this.getNovel(novelId);
    if (!novel) throw new Error(`Novel not found: ${novelId}`);
    return novel;
  }

  private requireVolume(volumeId: string): VolumeRecord {
    const row = this.database.prepare("SELECT * FROM volumes WHERE id = ?")
      .get(volumeId) as VolumeRow | undefined;
    if (!row) throw new Error(`Volume not found: ${volumeId}`);
    return this.toVolume(row);
  }

  private requireChapter(chapterId: string): ChapterRecord {
    const chapter = this.getChapter(chapterId);
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);
    return chapter;
  }

  private requireRevision(revisionId: string): ChapterRevisionRecord {
    const revision = this.getRevision(revisionId);
    if (!revision) throw new Error(`Chapter revision not found: ${revisionId}`);
    return revision;
  }

  private toNovel(row: NovelRow): NovelRecord {
    return {
      id: row.id,
      title: row.title,
      synopsis: row.synopsis,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private toVolume(row: VolumeRow): VolumeRecord {
    return {
      id: row.id,
      novelId: row.novel_id,
      title: row.title,
      summary: row.summary,
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private toChapter(row: ChapterRow): ChapterRecord {
    return {
      id: row.id,
      novelId: row.novel_id,
      volumeId: row.volume_id,
      title: row.title,
      status: row.status,
      sortOrder: row.sort_order,
      currentRevisionId: row.current_revision_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private toRevision(row: RevisionRow): ChapterRevisionRecord {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      revisionNumber: row.revision_number,
      content: row.content,
      contentHash: row.content_hash,
      characterCount: row.character_count,
      changeSummary: row.change_summary,
      createdAt: new Date(row.created_at),
    };
  }
}
