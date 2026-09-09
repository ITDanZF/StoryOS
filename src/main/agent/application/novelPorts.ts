import type { ChapterDraft } from "../../../shared/book/drafts.ts";
export type NovelStatus = "planning" | "writing" | "completed" | "archived";
export type ChapterStatus = "outline" | "draft" | "revising" | "completed";

export type NovelRecord = {
  readonly id: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
  readonly createdAt: Date;
  readonly rowVersion?: number;
  readonly updatedAt: Date;
};

export type VolumeRecord = {
  readonly id: string;
  readonly novelId: string;
  readonly title: string;
  readonly summary: string;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly rowVersion?: number;
  readonly updatedAt: Date;
};

export type ChapterRecord = {
  readonly id: string;
  readonly novelId: string;
  readonly volumeId: string | null;
  readonly title: string;
  readonly status: ChapterStatus;
  readonly sortOrder: number;
  readonly currentRevisionId: string | null;
  readonly createdAt: Date;
  readonly rowVersion?: number;
  readonly updatedAt: Date;
};

export type ChapterSummaryRecord = ChapterRecord & {
  readonly characterCount: number;
  readonly revisionNumber: number | null;
};

export type ChapterRevisionRecord = {
  readonly id: string;
  readonly chapterId: string;
  readonly revisionNumber: number;
  readonly content: string;
  readonly contentHash: string;
  readonly parentRevisionId?: string | null;
  readonly textHash?: string;
  readonly extractorVersion?: number;
  readonly deviceId?: string;
  readonly origin?: "editor" | "agent" | "import" | "restore";
  readonly sourceRunId?: string;
  readonly restoredFromRevisionId?: string;
  readonly characterCount: number;
  readonly changeSummary: string;
  readonly createdAt: Date;
};

export interface NovelPersistence {
  getDraft(chapterId: string): ChapterDraft | null;
  saveDraft(input: {
    chapterId: string;
    baseRevisionId: string | null;
    expectedDraftVersion: number;
    content: string;
  }): ChapterDraft;

  createNovel(input: Omit<NovelRecord, "createdAt" | "updatedAt">): NovelRecord;
  getNovel(novelId: string): NovelRecord | null;
  listNovels(): NovelRecord[];
  updateNovel(
    input: Pick<
      NovelRecord,
      "id" | "title" | "synopsis" | "status" | "rowVersion"
    >,
  ): NovelRecord;
  deleteNovel(novelId: string): void;
  createVolume(
    input: Omit<VolumeRecord, "createdAt" | "updatedAt">,
  ): VolumeRecord;
  listVolumes(novelId: string): VolumeRecord[];
  updateVolume(
    input: Pick<
      VolumeRecord,
      "id" | "title" | "summary" | "sortOrder" | "rowVersion"
    >,
  ): VolumeRecord;
  deleteVolume(volumeId: string): void;
  createChapter(
    input: Omit<ChapterRecord, "currentRevisionId" | "createdAt" | "updatedAt">,
  ): ChapterRecord;
  getChapter(chapterId: string): ChapterRecord | null;
  listChapters(novelId: string): ChapterRecord[];
  listChapterSummaries(novelId: string): ChapterSummaryRecord[];
  updateChapter(
    input: Pick<
      ChapterRecord,
      "id" | "volumeId" | "title" | "status" | "sortOrder" | "rowVersion"
    >,
  ): ChapterRecord;
  deleteChapter(chapterId: string): void;
  saveRevision(
    input: Omit<ChapterRevisionRecord, "revisionNumber" | "createdAt"> & {
      readonly expectedCurrentRevisionId: string | null;
      readonly expectedRowVersion?: number;
      readonly expectedDraftVersion?: number;
    },
  ): ChapterRevisionRecord;
  getRevisionMetadata(
    revisionId: string,
  ): Omit<ChapterRevisionRecord, "content"> | null;
  getRevision(revisionId: string): ChapterRevisionRecord | null;
  listRevisions(chapterId: string): Omit<ChapterRevisionRecord, "content">[];
}
