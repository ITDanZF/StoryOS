import type {
  ChapterDto,
  ChapterRevisionDto,
  NovelDto,
  VolumeDto,
} from "./novelContracts.ts";
import type { NovelStatus } from "./novelPorts.ts";

export type BookWorkspaceChapterDto = ChapterDto & {
  readonly content: string;
  readonly characterCount: number;
  readonly revisionNumber: number | null;
};

export type ReadyBookWorkspaceSnapshot = {
  readonly state: "ready";
  readonly book: NovelDto;
  readonly volumes: readonly VolumeDto[];
  readonly chapters: readonly BookWorkspaceChapterDto[];
};

export type UninitializedBookWorkspaceSnapshot = {
  readonly state: "uninitialized";
  readonly projectId: string;
};

export type BookWorkspaceSnapshot =
  | ReadyBookWorkspaceSnapshot
  | UninitializedBookWorkspaceSnapshot;

export type CreateBookRequest = {
  readonly projectId: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
};

export type CreateBookChapterRequest = {
  readonly projectId: string;
  readonly volumeId: string;
  readonly title: string;
};

export type CreateBookVolumeRequest = {
  readonly projectId: string;
  readonly title: string;
};

export type DeleteBookVolumeRequest = {
  readonly projectId: string;
  readonly volumeId: string;
};

export type DeleteBookChapterRequest = {
  readonly projectId: string;
  readonly chapterId: string;
};

export type UpdateBookRequest = {
  readonly projectId: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
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
