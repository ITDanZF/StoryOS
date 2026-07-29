import type {
  ChapterDto,
  ChapterRevisionDto,
  NovelDto,
  VolumeDto,
} from "./novelContracts.ts";

export type BookWorkspaceChapterDto = ChapterDto & {
  readonly content: string;
  readonly characterCount: number;
  readonly revisionNumber: number | null;
};

export type BookWorkspaceSnapshot = {
  readonly book: NovelDto;
  readonly volumes: readonly VolumeDto[];
  readonly chapters: readonly BookWorkspaceChapterDto[];
};

export type CreateBookChapterRequest = {
  readonly projectId: string;
  readonly volumeId: string | null;
  readonly title: string;
};

export type CreateBookVolumeRequest = {
  readonly projectId: string;
  readonly title: string;
};

export type UpdateBookChapterRequest = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly title: string;
};

export type SaveBookChapterContentRequest = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly content: string;
};

export type BookChapterRevisionResult = {
  readonly chapter: BookWorkspaceChapterDto;
  readonly revision: ChapterRevisionDto;
};
