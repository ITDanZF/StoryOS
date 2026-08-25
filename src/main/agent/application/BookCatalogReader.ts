import {
  BookRuntimeOpenError,
  type BookRuntimeFailureCode,
} from "../runtime/BookRuntimeManager.ts";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import NovelApplication from "./NovelApplication.ts";
import type { BookRecord } from "./bookRegistryPorts.ts";
import type {
  AvailableBookshelfBookCard,
  BookshelfBookCard,
  UnavailableBookshelfBookCard,
} from "./bookshelfContracts.ts";

function toUnavailableStorageState(
  code: BookRuntimeFailureCode,
): "missing" | "corrupted" {
  return code === "missing_database" || code === "storage_unavailable"
    ? "missing"
    : "corrupted";
}

export default class BookCatalogReader {
  constructor(private readonly runtimes: BookRuntimeManager) {}

  read(book: BookRecord, linkedProjectCount: number): BookshelfBookCard {
    if (book.state !== "available") {
      return this.createUnavailable(
        book.id,
        linkedProjectCount,
        book.state,
        `Book storage is ${book.state}: ${book.id}`,
      );
    }

    try {
      return this.readAvailable(book.id, linkedProjectCount);
    } catch (error) {
      if (!(error instanceof BookRuntimeOpenError)) throw error;
      return this.createUnavailable(
        book.id,
        linkedProjectCount,
        toUnavailableStorageState(error.code),
        error.message,
      );
    }
  }

  private readAvailable(
    bookId: string,
    linkedProjectCount: number,
  ): AvailableBookshelfBookCard {
    const lease = this.runtimes.acquire(bookId);
    try {
      const novels = new NovelApplication(lease.persistence);
      const novel = novels.getProjectBook();
      if (!novel) {
        throw new BookRuntimeOpenError(
          "corrupted_database",
          `Book contains no novel record: ${bookId}`,
        );
      }
      const volumes = novels.listVolumes(novel.id);
      const chapters = novels.listChapters(novel.id);
      const characterCount = chapters.reduce((total, chapter) => {
        if (!chapter.currentRevisionId) return total;
        const revision = novels.getCurrentRevision(chapter.id);
        if (!revision) {
          throw new BookRuntimeOpenError(
            "corrupted_database",
            `Current chapter revision not found: ${chapter.id}`,
          );
        }
        return total + revision.characterCount;
      }, 0);
      return Object.freeze({
        availability: "ready",
        bookId,
        title: novel.title,
        status: novel.status,
        storageState: "available",
        volumeCount: volumes.length,
        chapterCount: chapters.length,
        characterCount,
        linkedProjectCount,
      });
    } finally {
      lease.close();
    }
  }

  private createUnavailable(
    bookId: string,
    linkedProjectCount: number,
    storageState: "missing" | "importing" | "trashed" | "corrupted",
    reason: string,
  ): UnavailableBookshelfBookCard {
    return Object.freeze({
      availability: "unavailable",
      bookId,
      storageState,
      linkedProjectCount,
      reason,
    });
  }
}
