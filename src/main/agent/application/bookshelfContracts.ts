import type { NovelStatus } from "./novelPorts.ts";
import type { BookStorageState } from "./bookRegistryPorts.ts";

export type BookshelfStorageState = BookStorageState;

export type AvailableBookshelfBookCard = {
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
  readonly availability: "unavailable";
  readonly bookId: string;
  readonly storageState: Exclude<BookshelfStorageState, "available">;
  readonly linkedProjectId: string | null;
  readonly linkedProjectCount: number;
  readonly lastOpenedAt: string | null;
  readonly reason: string;
};

export type BookshelfBookCard =
  | AvailableBookshelfBookCard
  | UnavailableBookshelfBookCard;

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
