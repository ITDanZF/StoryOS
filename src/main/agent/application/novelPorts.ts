export type NovelStatus = "planning" | "writing" | "completed" | "archived";
export type ChapterStatus = "outline" | "draft" | "revising" | "completed";

export type NovelRecord = {
  readonly id: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type VolumeRecord = {
  readonly id: string;
  readonly novelId: string;
  readonly title: string;
  readonly summary: string;
  readonly sortOrder: number;
  readonly createdAt: Date;
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
  readonly updatedAt: Date;
};

export type ChapterRevisionRecord = {
  readonly id: string;
  readonly chapterId: string;
  readonly revisionNumber: number;
  readonly content: string;
  readonly contentHash: string;
  readonly characterCount: number;
  readonly changeSummary: string;
  readonly createdAt: Date;
};

export interface NovelPersistence {
  createNovel(input: Omit<NovelRecord, "createdAt" | "updatedAt">): NovelRecord;
  getNovel(novelId: string): NovelRecord | null;
  listNovels(): NovelRecord[];
  updateNovel(input: Pick<NovelRecord, "id" | "title" | "synopsis" | "status">): NovelRecord;
  deleteNovel(novelId: string): void;
  createVolume(input: Omit<VolumeRecord, "createdAt" | "updatedAt">): VolumeRecord;
  listVolumes(novelId: string): VolumeRecord[];
  updateVolume(input: Pick<VolumeRecord, "id" | "title" | "summary" | "sortOrder">): VolumeRecord;
  deleteVolume(volumeId: string): void;
  createChapter(input: Omit<ChapterRecord, "currentRevisionId" | "createdAt" | "updatedAt">): ChapterRecord;
  getChapter(chapterId: string): ChapterRecord | null;
  listChapters(novelId: string): ChapterRecord[];
  updateChapter(input: Pick<ChapterRecord, "id" | "volumeId" | "title" | "status" | "sortOrder">): ChapterRecord;
  deleteChapter(chapterId: string): void;
  saveRevision(input: Omit<ChapterRevisionRecord, "revisionNumber" | "createdAt"> & {
    readonly expectedCurrentRevisionId: string | null;
  }): ChapterRevisionRecord;
  getRevision(revisionId: string): ChapterRevisionRecord | null;
  listRevisions(chapterId: string): ChapterRevisionRecord[];
}
