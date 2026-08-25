import type { NovelStatus } from "./novelPorts.ts";
import type { BookStorageState } from "./bookRegistryPorts.ts";

export type BookshelfStorageState = BookStorageState;

export type AvailableBookshelfBookCard = {
  readonly availability: "ready";
  readonly bookId: string;
  readonly title: string;
  readonly status: NovelStatus;
  readonly storageState: "available";
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly linkedProjectCount: number;
};

export type UnavailableBookshelfBookCard = {
  readonly availability: "unavailable";
  readonly bookId: string;
  readonly storageState: Exclude<BookshelfStorageState, "available">;
  readonly linkedProjectCount: number;
  readonly reason: string;
};

export type BookshelfBookCard =
  | AvailableBookshelfBookCard
  | UnavailableBookshelfBookCard;

export type BookshelfTrashEntry = {
  readonly bookId: string;
  readonly storageState: "trashed";
  readonly trashedAt: string;
};
