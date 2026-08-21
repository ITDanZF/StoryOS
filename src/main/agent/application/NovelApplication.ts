import { createHash } from "node:crypto";
import type {
  ChapterDto,
  ChapterRevisionDto,
  NovelDto,
  VolumeDto,
} from "./novelContracts.ts";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  ChapterStatus,
  NovelPersistence,
  NovelRecord,
  NovelStatus,
  VolumeRecord,
} from "./novelPorts.ts";

const NOVEL_STATUSES = new Set<NovelStatus>([
  "planning", "writing", "completed", "archived",
]);
const CHAPTER_STATUSES = new Set<ChapterStatus>([
  "outline", "draft", "revising", "completed",
]);

export default class NovelApplication {
  constructor(private readonly persistence: NovelPersistence) {}

  getProjectBook(): NovelDto | null {
    const books = this.persistence.listNovels();
    if (books.length > 1) {
      throw new Error("Project storage contains more than one book.");
    }
    return books[0] ? this.toNovelDto(books[0]) : null;
  }

  createNovel(input: {
    readonly title: string;
    readonly synopsis?: string;
    readonly status?: NovelStatus;
  }): NovelDto {
    if (this.persistence.listNovels().length > 0) {
      throw new Error("Each project can contain only one book.");
    }
    return this.toNovelDto(this.persistence.createNovel({
      id: `novel_${crypto.randomUUID()}`,
      title: this.requireTitle(input.title),
      synopsis: input.synopsis?.trim() ?? "",
      status: this.requireNovelStatus(input.status ?? "planning"),
    }));
  }

  getNovel(novelId: string): NovelDto {
    return this.toNovelDto(this.requireNovel(novelId));
  }

  listNovels(): readonly NovelDto[] {
    return Object.freeze(
      this.persistence.listNovels().map((record) => this.toNovelDto(record)),
    );
  }

  updateNovel(input: {
    readonly id: string;
    readonly title: string;
    readonly synopsis: string;
    readonly status: NovelStatus;
  }): NovelDto {
    this.requireNovel(input.id);
    return this.toNovelDto(this.persistence.updateNovel({
      id: input.id,
      title: this.requireTitle(input.title),
      synopsis: input.synopsis.trim(),
      status: this.requireNovelStatus(input.status),
    }));
  }

  deleteNovel(novelId: string): void {
    this.requireNovel(novelId);
    this.persistence.deleteNovel(novelId);
  }

  createVolume(input: {
    readonly novelId: string;
    readonly title: string;
    readonly summary?: string;
    readonly sortOrder: number;
  }): VolumeDto {
    this.requireNovel(input.novelId);
    const requestedOrder = this.requireSortOrder(input.sortOrder);
    const existing = this.persistence.listVolumes(input.novelId);
    const appendOrder = Math.max(...existing.map((item) => item.sortOrder), -1) + 1;
    const created = this.persistence.createVolume({
      id: `volume_${crypto.randomUUID()}`,
      novelId: input.novelId,
      title: this.requireTitle(input.title),
      summary: input.summary?.trim() ?? "",
      sortOrder: appendOrder,
    });
    return this.toVolumeDto(requestedOrder === appendOrder
      ? created
      : this.persistence.updateVolume({
          id: created.id,
          title: created.title,
          summary: created.summary,
          sortOrder: requestedOrder,
        }));
  }

  listVolumes(novelId: string): readonly VolumeDto[] {
    this.requireNovel(novelId);
    return Object.freeze(
      this.persistence.listVolumes(novelId)
        .map((record) => this.toVolumeDto(record)),
    );
  }

  updateVolume(input: {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly sortOrder: number;
  }): VolumeDto {
    return this.toVolumeDto(this.persistence.updateVolume({
      id: input.id,
      title: this.requireTitle(input.title),
      summary: input.summary.trim(),
      sortOrder: this.requireSortOrder(input.sortOrder),
    }));
  }

  deleteVolume(volumeId: string): void {
    this.persistence.deleteVolume(volumeId);
  }

  createChapter(input: {
    readonly novelId: string;
    readonly volumeId?: string | null;
    readonly title: string;
    readonly status?: ChapterStatus;
    readonly sortOrder: number;
  }): ChapterDto {
    this.requireNovel(input.novelId);
    const requestedOrder = this.requireSortOrder(input.sortOrder);
    const existing = this.persistence.listChapters(input.novelId).filter(
      (item) => item.volumeId === (input.volumeId ?? null),
    );
    const appendOrder = Math.max(...existing.map((item) => item.sortOrder), -1) + 1;
    const created = this.persistence.createChapter({
      id: `chapter_${crypto.randomUUID()}`,
      novelId: input.novelId,
      volumeId: input.volumeId ?? null,
      title: this.requireTitle(input.title),
      status: this.requireChapterStatus(input.status ?? "outline"),
      sortOrder: appendOrder,
    });
    return this.toChapterDto(requestedOrder === appendOrder
      ? created
      : this.persistence.updateChapter({
          id: created.id,
          volumeId: created.volumeId,
          title: created.title,
          status: created.status,
          sortOrder: requestedOrder,
        }));
  }

  getChapter(chapterId: string): ChapterDto {
    return this.toChapterDto(this.requireChapter(chapterId));
  }

  listChapters(novelId: string): readonly ChapterDto[] {
    this.requireNovel(novelId);
    return Object.freeze(
      this.persistence.listChapters(novelId)
        .map((record) => this.toChapterDto(record)),
    );
  }

  updateChapter(input: {
    readonly id: string;
    readonly volumeId: string | null;
    readonly title: string;
    readonly status: ChapterStatus;
    readonly sortOrder: number;
  }): ChapterDto {
    this.requireChapter(input.id);
    return this.toChapterDto(this.persistence.updateChapter({
      id: input.id,
      volumeId: input.volumeId,
      title: this.requireTitle(input.title),
      status: this.requireChapterStatus(input.status),
      sortOrder: this.requireSortOrder(input.sortOrder),
    }));
  }

  deleteChapter(chapterId: string): void {
    this.requireChapter(chapterId);
    this.persistence.deleteChapter(chapterId);
  }

  getCurrentRevision(chapterId: string): ChapterRevisionDto | null {
    const chapter = this.requireChapter(chapterId);
    if (!chapter.currentRevisionId) return null;
    const revision = this.persistence.getRevision(chapter.currentRevisionId);
    if (!revision) {
      throw new Error(
        `Current chapter revision not found: ${chapter.currentRevisionId}`,
      );
    }
    return this.toRevisionDto(revision);
  }

  saveRevision(input: {
    readonly chapterId: string;
    readonly content: string;
    readonly characterCount?: number;
    readonly changeSummary?: string;
    readonly expectedCurrentRevisionId: string | null;
  }): ChapterRevisionDto {
    const chapter = this.requireChapter(input.chapterId);
    if (chapter.currentRevisionId !== input.expectedCurrentRevisionId) {
      throw new Error(`Chapter revision conflict: ${input.chapterId}`);
    }
    const contentHash = createHash("sha256")
      .update(input.content, "utf8")
      .digest("hex");
    if (chapter.currentRevisionId) {
      const current = this.persistence.getRevision(chapter.currentRevisionId);
      if (!current) {
        throw new Error(
          `Current chapter revision not found: ${chapter.currentRevisionId}`,
        );
      }
      if (current.contentHash === contentHash) {
        return this.toRevisionDto(current);
      }
    }
    return this.toRevisionDto(this.persistence.saveRevision({
      id: `revision_${crypto.randomUUID()}`,
      chapterId: input.chapterId,
      content: input.content,
      contentHash,
      characterCount: input.characterCount === undefined
        ? Array.from(input.content).length
        : this.requireCharacterCount(input.characterCount),
      changeSummary: input.changeSummary?.trim() ?? "",
      expectedCurrentRevisionId: input.expectedCurrentRevisionId,
    }));
  }

  listRevisions(chapterId: string): readonly ChapterRevisionDto[] {
    this.requireChapter(chapterId);
    return Object.freeze(
      this.persistence.listRevisions(chapterId)
        .map((record) => this.toRevisionDto(record)),
    );
  }

  private requireNovel(novelId: string): NovelRecord {
    const novel = this.persistence.getNovel(novelId);
    if (!novel) throw new Error(`Novel not found: ${novelId}`);
    return novel;
  }

  private requireChapter(chapterId: string): ChapterRecord {
    const chapter = this.persistence.getChapter(chapterId);
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);
    return chapter;
  }

  private requireTitle(title: string): string {
    const normalized = title.trim();
    if (!normalized) throw new Error("Title is required.");
    if (normalized.length > 200) {
      throw new Error("Title must be 200 characters or fewer.");
    }
    return normalized;
  }

  private requireSortOrder(sortOrder: number): number {
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      throw new Error("Sort order must be a non-negative integer.");
    }
    return sortOrder;
  }

  private requireCharacterCount(characterCount: number): number {
    if (!Number.isSafeInteger(characterCount) || characterCount < 0) {
      throw new Error("Character count must be a non-negative integer.");
    }
    return characterCount;
  }

  private requireNovelStatus(status: NovelStatus): NovelStatus {
    if (!NOVEL_STATUSES.has(status)) {
      throw new Error(`Invalid novel status: ${status}`);
    }
    return status;
  }

  private requireChapterStatus(status: ChapterStatus): ChapterStatus {
    if (!CHAPTER_STATUSES.has(status)) {
      throw new Error(`Invalid chapter status: ${status}`);
    }
    return status;
  }

  private toNovelDto(record: NovelRecord): NovelDto {
    return Object.freeze({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toVolumeDto(record: VolumeRecord): VolumeDto {
    return Object.freeze({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toChapterDto(record: ChapterRecord): ChapterDto {
    return Object.freeze({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toRevisionDto(record: ChapterRevisionRecord): ChapterRevisionDto {
    return Object.freeze({
      ...record,
      createdAt: record.createdAt.toISOString(),
    });
  }
}
