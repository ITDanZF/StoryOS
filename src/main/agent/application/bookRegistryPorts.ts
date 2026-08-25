export type BookStorageState = "available" | "missing";

export type BookRecord = {
  readonly id: string;
  readonly storagePath: string;
  readonly state: BookStorageState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastOpenedAt: Date | null;
};

export interface BookRegistry {
  registerBookForProject(input: {
    readonly id: string;
    readonly projectId: string;
    readonly storagePath: string;
  }): BookRecord;
  getBookById(bookId: string): BookRecord | null;
  getBookForProject(projectId: string): BookRecord | null;
  listBooks(): readonly BookRecord[];
  detachBook(projectId: string): void;
}
