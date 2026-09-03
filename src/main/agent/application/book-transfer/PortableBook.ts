import type { TiptapDocument } from '../../../../shared/book/richText.ts';
import type { ChapterStatus, NovelStatus } from '../novelPorts.ts';

export type PortableChapterDraft = {
  readonly key: string;
  readonly title: string;
  readonly status: ChapterStatus;
  readonly document: TiptapDocument;
};

export type PortableVolumeDraft = {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly chapters: readonly PortableChapterDraft[];
};

export type PortableBookDraft = {
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
  readonly volumes: readonly PortableVolumeDraft[];
  readonly ungroupedChapters: readonly PortableChapterDraft[];
  readonly warnings: readonly {
    readonly code: string;
    readonly message: string;
    readonly severity: 'info' | 'warning';
  }[];
};

export type BookExportChapter = {
  readonly id: string;
  readonly title: string;
  readonly status: ChapterStatus;
  readonly sortOrder: number;
  readonly document: TiptapDocument;
  readonly characterCount: number;
};

export type BookExportVolume = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly sortOrder: number;
  readonly chapters: readonly BookExportChapter[];
};

export type BookExportSnapshot = {
  readonly bookId: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
  readonly volumes: readonly BookExportVolume[];
  readonly ungroupedChapters: readonly BookExportChapter[];
  readonly characterCount: number;
};
