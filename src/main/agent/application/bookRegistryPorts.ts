export type BookStorageState =
  | "available"
  | "missing"
  | "importing"
  | "trashed"
  | "corrupted";

export type BookRecord = {
  readonly id: string;
  readonly storagePath: string;
  readonly state: BookStorageState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastOpenedAt: Date | null;
};

export type BookDeletionCleanupState = "pending" | "completed" | "failed";

export type BookTrashRecord = {
  readonly bookId: string;
  readonly title: string;
  readonly trashedAt: Date;
};

export interface BookRegistry {
  registerBookForProject(input: {
    readonly id: string;
    readonly projectId: string;
    readonly storagePath: string;
  }): BookRecord;
  registerStandaloneBook(input: {
    readonly id: string;
    readonly storagePath: string;
  }): BookRecord;
  registerImportedBook(input: {
    readonly id: string;
    readonly storagePath: string;
  }): BookRecord;
  getBookById(bookId: string): BookRecord | null;
  getBookForProject(projectId: string): BookRecord | null;
  listProjectIdsForBook(bookId: string): readonly string[];
  listBooks(): readonly BookRecord[];
  attachExistingBook(input: {
    readonly projectId: string;
    readonly bookId: string;
  }): void;
  detachBook(projectId: string): void;
  updateStorageState(bookId: string, state: BookStorageState): BookRecord;
  listTrash(): readonly BookTrashRecord[];
  moveBookToTrash(input: {
    readonly bookId: string;
    readonly title: string;
    readonly trashedAt: Date;
  }): BookTrashRecord;
  restoreBookFromTrash(
    bookId: string,
    state: "available" | "missing" | "corrupted",
  ): BookRecord;
  touchOpened(bookId: string): BookRecord;
  deleteBookRegistration(input: {
    readonly bookId: string;
    readonly operationId: string;
    readonly deletedAt: Date;
  }): void;
  updateBookDeletionCleanup(
    operationId: string,
    state: Exclude<BookDeletionCleanupState, "pending">,
  ): void;
  abandonImportedBook(bookId: string): void;
  rollbackRestoredBook(input: {
    readonly bookId: string;
    readonly projectId: string;
    readonly storagePath: string;
  }): void;
}
