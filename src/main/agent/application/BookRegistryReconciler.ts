import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import type {
  BookRegistry,
  BookStorageState,
} from "./bookRegistryPorts.ts";

export type BookReconciliationResult = {
  readonly bookId: string;
  readonly previousState: BookStorageState;
  readonly state: BookStorageState;
  readonly changed: boolean;
  readonly reason?: string;
};

export default class BookRegistryReconciler {
  constructor(
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
  ) {}

  reconcile(): readonly BookReconciliationResult[] {
    return Object.freeze(this.books.listBooks().map((book) => {
      if (book.state === "trashed" || book.state === "importing") {
        return Object.freeze({
          bookId: book.id,
          previousState: book.state,
          state: book.state,
          changed: false,
        });
      }
      const health = this.runtimes.inspectStorage(book.id);
      const state: BookStorageState = health.state;
      if (state !== book.state) {
        this.books.updateStorageState(book.id, state);
      }
      return Object.freeze({
        bookId: book.id,
        previousState: book.state,
        state,
        changed: state !== book.state,
        ...(health.state === "available" ? {} : { reason: health.reason }),
      });
    }));
  }
}
