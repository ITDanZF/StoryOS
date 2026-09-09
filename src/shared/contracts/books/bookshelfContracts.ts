import type { BookStorageState } from "../conversations/bookRegistryPorts.ts";
import type { NovelStatus } from "./novelPorts.ts";

export type BookshelfBookCard = AvailableBookshelfBookCard | UnavailableBookshelfBookCard;

export type AvailableBookshelfBookCard = {
  readonly listCursor?: string;
  readonly availability: "ready";
  readonly bookId: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: NovelStatus;
  readonly storageState: "available";
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly linkedProjectId: string | null;
  readonly linkedProjectCount: number;
  readonly updatedAt: string;
  readonly lastOpenedAt: string | null;
};

export type UnavailableBookshelfBookCard = {
  readonly listCursor?: string;
  readonly availability: "unavailable";
  readonly bookId: string;
  readonly storageState: Exclude<BookshelfStorageState, "available">;
  readonly linkedProjectId: string | null;
  readonly linkedProjectCount: number;
  readonly lastOpenedAt: string | null;
  readonly reason: string;
};

export type BookshelfStorageState = BookStorageState;

export type BookshelfTrashEntry = {
  readonly bookId: string;
  readonly title: string;
  readonly storageState: "trashed";
  readonly trashedAt: string;
};

export type CreateBookshelfBookRequest = {
  readonly title: string;
  readonly synopsis: string;
};

export type CreateBookshelfBookResult = {
  readonly bookId: string;
  readonly book: AvailableBookshelfBookCard;
};
