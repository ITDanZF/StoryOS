import type { NovelDto, VolumeDto } from "../contracts/books/novelContracts.ts";

export type ReaderChapter = {
  id: string;
  volumeId: string | null;
  title: string;
  sortOrder: number;
  revisionId: string | null;
  contentHash: string | null;
  characterCount: number;
};
export type ReaderManifest = {
  book: NovelDto;
  volumes: VolumeDto[];
  chapters: ReaderChapter[];
};
export type ReaderAnchor = {
  chapterId: string;
  revisionId: string;
  position: number;
  textOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
};
export type ReaderPreferences = {
  mode: "three-dimensional" | "plain";
  spread: "auto" | "single" | "double";
  fontSize: number;
  lineHeight: number;
  theme: "paper" | "dark";
};
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  mode: "three-dimensional",
  spread: "auto",
  fontSize: 18,
  lineHeight: 1.8,
  theme: "paper",
};
export type BookReadingState = {
  bookId: string;
  stateVersion?: number;
  schemaVersion: 1;
  anchor: ReaderAnchor | null;
  preferences: ReaderPreferences;
  lastReadAt: string;
};
export type ReaderSnapshot = ReaderManifest & {
  snapshotId: string;
  readingState: BookReadingState | null;
};
export type ReaderChapterContent = {
  revisionId: string | null;
  contentHash: string | null;
  content: string;
  characterCount: number;
};
export type ReaderSaveRequest = {
  snapshotId: string;
  sequence: number;
  anchor: ReaderAnchor | null;
  preferences: ReaderPreferences;
};
export type BookReaderApi = {
  openBookReader(bookId: string): Promise<ReaderSnapshot>;
  readBookReaderChapter(request: {
    snapshotId: string;
    chapterId: string;
  }): Promise<ReaderChapterContent>;
  getBookReaderStatus(snapshotId: string): Promise<"unchanged" | "changed" | "unavailable">;
  saveBookReadingState(request: ReaderSaveRequest): Promise<void>;
  closeBookReader(snapshotId: string): Promise<void>;
};
export const READER_CHANNELS = {
  openBookReader: "agent:reader-open",
  readBookReaderChapter: "agent:reader-chapter",
  getBookReaderStatus: "agent:reader-status",
  saveBookReadingState: "agent:reader-save",
  closeBookReader: "agent:reader-close",
} as const;
