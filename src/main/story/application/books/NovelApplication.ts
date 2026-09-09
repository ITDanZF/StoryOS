import { createHash } from "node:crypto";
import {
  countTiptapCharacters,
  parseTiptapDocument,
  plainTextToTiptapDocument,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type {
  ChapterDto,
  ChapterRevisionDto,
  NovelDto,
  VolumeDto,
} from "../../../../shared/contracts/books/novelContracts.ts";
import {
  createNovelMutation,
  type NovelMutationHandler,
  type NovelMutationKind,
} from "./novelEvents.ts";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  ChapterStatus,
  NovelPersistence,
  NovelRecord,
  NovelStatus,
  VolumeRecord,
} from "./novelPorts.ts";

const NOVEL_STATUSES = new Set<NovelStatus>(["planning", "writing", "completed", "archived"]);
const CHAPTER_STATUSES = new Set<ChapterStatus>(["outline", "draft", "revising", "completed"]);

export default class NovelApplication {
  constructor(
    private readonly persistence: NovelPersistence,
    private readonly onMutation?: NovelMutationHandler,
  ) {}

  private emitMutation(
    kind: NovelMutationKind,
    references: Parameters<typeof createNovelMutation>[1],
  ): void {
    this.onMutation?.(createNovelMutation(kind, references));
  }

  getProjectBook(): NovelDto | null {
    const books = this.persistence.listNovels();
    if (books.length > 1) {
      throw new Error("Book storage contains more than one novel record.");
    }
    return books[0] ? this.toNovelDto(books[0]) : null;
  }

  createNovel(input: {
    readonly title: string;
    readonly synopsis?: string;
    readonly status?: NovelStatus;
  }): NovelDto {
    if (this.persistence.listNovels().length > 0) {
      throw new Error("Each book database can contain only one novel record.");
    }
    const created = this.toNovelDto(
      this.persistence.createNovel({
        id: `novel_${crypto.randomUUID()}`,
        title: this.requireTitle(input.title),
        synopsis: input.synopsis?.trim() ?? "",
        status: this.requireNovelStatus(input.status ?? "planning"),
      }),
    );
    this.emitMutation("novel_created", { novelId: created.id });
    return created;
  }

  getNovel(novelId: string): NovelDto {
    return this.toNovelDto(this.requireNovel(novelId));
  }

  listNovels(): readonly NovelDto[] {
    return Object.freeze(this.persistence.listNovels().map((record) => this.toNovelDto(record)));
  }

  updateNovel(input: {
    readonly id: string;
    readonly rowVersion?: number;
    readonly title: string;
    readonly synopsis: string;
    readonly status: NovelStatus;
  }): NovelDto {
    const current = this.requireNovel(input.id);
    const updated = this.toNovelDto(
      this.persistence.updateNovel({
        id: input.id,
        rowVersion: input.rowVersion ?? current.rowVersion,
        title: this.requireTitle(input.title),
        synopsis: input.synopsis.trim(),
        status: this.requireNovelStatus(input.status),
      }),
    );
    this.emitMutation("novel_updated", { novelId: updated.id });
    return updated;
  }

  deleteNovel(novelId: string): void {
    this.requireNovel(novelId);
    this.persistence.deleteNovel(novelId);
    this.emitMutation("novel_deleted", { novelId });
  }

  createVolume(input: {
    readonly novelId: string;
    readonly title: string;
    readonly summary?: string;
    readonly sortOrder: number;
  }): VolumeDto {
    this.requireNovel(input.novelId);
    const requestedOrder = this.requireSortOrder(input.sortOrder);
    const result = this.toVolumeDto(
      this.persistence.createVolume({
        id: `volume_${crypto.randomUUID()}`,
        novelId: input.novelId,
        title: this.requireTitle(input.title),
        summary: input.summary?.trim() ?? "",
        sortOrder: requestedOrder,
      }),
    );
    this.emitMutation("volume_created", {
      novelId: input.novelId,
      volumeId: result.id,
    });
    return result;
  }

  listVolumes(novelId: string): readonly VolumeDto[] {
    this.requireNovel(novelId);
    return Object.freeze(
      this.persistence.listVolumes(novelId).map((record) => this.toVolumeDto(record)),
    );
  }

  updateVolume(input: {
    readonly id: string;
    readonly rowVersion?: number;
    readonly title: string;
    readonly summary: string;
    readonly sortOrder: number;
  }): VolumeDto {
    const current = this.persistence
      .listNovels()
      .flatMap((book) => this.persistence.listVolumes(book.id))
      .find((volume) => volume.id === input.id);
    if (!current) throw new Error("Volume not found.");
    const updated = this.toVolumeDto(
      this.persistence.updateVolume({
        id: input.id,
        title: this.requireTitle(input.title),
        summary: input.summary.trim(),
        rowVersion: input.rowVersion ?? current.rowVersion,
        sortOrder: this.requireSortOrder(input.sortOrder),
      }),
    );
    this.emitMutation("volume_updated", {
      novelId: updated.novelId,
      volumeId: updated.id,
    });
    return updated;
  }

  deleteVolume(volumeId: string): void {
    this.persistence.deleteVolume(volumeId);
    this.emitMutation("volume_deleted", { volumeId });
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
    const result = this.toChapterDto(
      this.persistence.createChapter({
        id: `chapter_${crypto.randomUUID()}`,
        novelId: input.novelId,
        volumeId: input.volumeId ?? null,
        title: this.requireTitle(input.title),
        status: this.requireChapterStatus(input.status ?? "outline"),
        sortOrder: requestedOrder,
      }),
    );
    this.emitMutation("chapter_created", {
      novelId: result.novelId,
      ...(result.volumeId ? { volumeId: result.volumeId } : {}),
      chapterId: result.id,
    });
    return result;
  }

  getChapter(chapterId: string): ChapterDto {
    return this.toChapterDto(this.requireChapter(chapterId));
  }

  listChapters(novelId: string): readonly ChapterDto[] {
    this.requireNovel(novelId);
    return Object.freeze(
      this.persistence.listChapters(novelId).map((record) => this.toChapterDto(record)),
    );
  }

  listChapterSummaries(novelId: string) {
    this.requireNovel(novelId);
    return this.persistence.listChapterSummaries(novelId).map((record) => ({
      ...this.toChapterDto(record),
      characterCount: record.characterCount,
      revisionNumber: record.revisionNumber,
    }));
  }

  updateChapter(input: {
    readonly id: string;
    readonly rowVersion?: number;
    readonly volumeId: string | null;
    readonly title: string;
    readonly status: ChapterStatus;
    readonly sortOrder: number;
  }): ChapterDto {
    const current = this.requireChapter(input.id);
    const updated = this.toChapterDto(
      this.persistence.updateChapter({
        id: input.id,
        rowVersion: input.rowVersion ?? current.rowVersion,
        volumeId: input.volumeId,
        title: this.requireTitle(input.title),
        status: this.requireChapterStatus(input.status),
        sortOrder: this.requireSortOrder(input.sortOrder),
      }),
    );
    this.emitMutation("chapter_updated", {
      novelId: updated.novelId,
      ...(updated.volumeId ? { volumeId: updated.volumeId } : {}),
      chapterId: updated.id,
    });
    return updated;
  }

  deleteChapter(chapterId: string): void {
    const chapter = this.requireChapter(chapterId);
    this.persistence.deleteChapter(chapterId);
    this.emitMutation("chapter_deleted", {
      novelId: chapter.novelId,
      ...(chapter.volumeId ? { volumeId: chapter.volumeId } : {}),
      chapterId,
    });
  }

  getCurrentRevisionMetadata(chapterId: string): Omit<ChapterRevisionDto, "content"> | null {
    const chapter = this.requireChapter(chapterId);
    if (!chapter.currentRevisionId) return null;
    const revision = this.persistence.getRevisionMetadata(chapter.currentRevisionId);
    if (!revision) throw new Error("Current revision metadata is missing.");
    return { ...revision, createdAt: revision.createdAt.toISOString() };
  }

  getCurrentRevision(chapterId: string): ChapterRevisionDto | null {
    const chapter = this.requireChapter(chapterId);
    if (!chapter.currentRevisionId) return null;
    const revision = this.persistence.getRevision(chapter.currentRevisionId);
    if (!revision) {
      throw new Error(`Current chapter revision not found: ${chapter.currentRevisionId}`);
    }
    return this.toRevisionDto(revision);
  }

  saveRevision(input: {
    readonly chapterId: string;
    readonly content: string;
    readonly characterCount?: number;
    readonly changeSummary?: string;
    readonly expectedCurrentRevisionId: string | null;
    readonly expectedRowVersion?: number;
    readonly expectedDraftVersion?: number;
    readonly origin?: "editor" | "agent" | "import" | "restore";
    readonly restoredFromRevisionId?: string;
    readonly sourceRunId?: string;
  }): ChapterRevisionDto {
    const chapter = this.requireChapter(input.chapterId);
    if (
      (input.expectedRowVersion !== undefined && chapter.rowVersion !== input.expectedRowVersion) ||
      chapter.currentRevisionId !== input.expectedCurrentRevisionId
    ) {
      throw new Error(`Chapter revision conflict: ${input.chapterId}`);
    }
    const document = input.content.trimStart().startsWith("{")
      ? parseTiptapDocument(input.content)
      : plainTextToTiptapDocument(input.content);
    const content = serializeTiptapDocument(document);
    const contentHash = createHash("sha256").update(content, "utf8").digest("hex");
    if (chapter.currentRevisionId) {
      const current = this.persistence.getRevision(chapter.currentRevisionId);
      if (!current) {
        throw new Error(`Current chapter revision not found: ${chapter.currentRevisionId}`);
      }
      if (
        current.contentHash === contentHash &&
        input.expectedDraftVersion === undefined &&
        input.restoredFromRevisionId === undefined
      ) {
        return this.toRevisionDto(current);
      }
    }
    const saved = this.toRevisionDto(
      this.persistence.saveRevision({
        id: `revision_${crypto.randomUUID()}`,
        chapterId: input.chapterId,
        content,
        contentHash,
        characterCount: countTiptapCharacters(document),
        changeSummary: input.changeSummary?.trim() ?? "",
        expectedCurrentRevisionId: input.expectedCurrentRevisionId,
        expectedRowVersion: input.expectedRowVersion,
        expectedDraftVersion: input.expectedDraftVersion,
        origin: input.origin,
        restoredFromRevisionId: input.restoredFromRevisionId,
        sourceRunId: input.sourceRunId,
      }),
    );
    this.emitMutation("chapter_revision_saved", {
      novelId: chapter.novelId,
      ...(chapter.volumeId ? { volumeId: chapter.volumeId } : {}),
      chapterId: chapter.id,
      revisionId: saved.id,
      revisionNumber: saved.revisionNumber,
    });
    return saved;
  }

  listRevisions(chapterId: string): readonly Omit<ChapterRevisionDto, "content">[] {
    this.requireChapter(chapterId);
    return Object.freeze(
      this.persistence.listRevisions(chapterId).map((record) =>
        Object.freeze({
          ...record,
          createdAt: record.createdAt.toISOString(),
        }),
      ),
    );
  }

  restoreRevision(input: {
    chapterId: string;
    revisionId: string;
    expectedCurrentRevisionId: string | null;
    expectedRowVersion: number;
  }): ChapterRevisionDto {
    const source = this.persistence.getRevision(input.revisionId);
    if (!source || source.chapterId !== input.chapterId)
      throw new Error("Restored revision must belong to this chapter.");
    return this.saveRevision({
      ...input,
      content: source.content,
      origin: "restore",
      restoredFromRevisionId: source.id,
      changeSummary: `恢复修订 ${source.revisionNumber}`,
    });
  }

  getDraft(chapterId: string) {
    return this.persistence.getDraft(chapterId);
  }
  saveDraft(input: Parameters<NovelPersistence["saveDraft"]>[0]) {
    return this.persistence.saveDraft(input);
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
