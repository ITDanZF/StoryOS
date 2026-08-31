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

  read(
    book: BookRecord,
    linkedProjectIds: readonly string[],
  ): BookshelfBookCard {
    const linkedProjectId = linkedProjectIds[0] ?? null;
    const linkedProjectCount = linkedProjectIds.length;
    if (book.state !== "available") {
      return this.createUnavailable(
        book,
        linkedProjectId,
        linkedProjectCount,
        `Book storage is ${book.state}: ${book.id}`,
      );
    }

    try {
      return this.readAvailable(
        book,
        linkedProjectId,
        linkedProjectCount,
      );
    } catch (error) {
      if (!(error instanceof BookRuntimeOpenError)) throw error;
      return this.createUnavailable(
        book,
        linkedProjectId,
        linkedProjectCount,
        error.message,
        toUnavailableStorageState(error.code),
      );
    }
  }

  private readAvailable(
    book: BookRecord,
    linkedProjectId: string | null,
    linkedProjectCount: number,
  ): AvailableBookshelfBookCard {
    const bookId = book.id;
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
      let characterCount = 0;
      let updatedAt = novel.updatedAt;
      for (const chapter of chapters) {
        if (chapter.updatedAt > updatedAt) updatedAt = chapter.updatedAt;
        if (!chapter.currentRevisionId) continue;
        const revision = novels.getCurrentRevision(chapter.id);
        if (!revision) {
          throw new BookRuntimeOpenError(
            "corrupted_database",
            `Current chapter revision not found: ${chapter.id}`,
          );
        }
        characterCount += revision.characterCount;
        if (revision.createdAt > updatedAt) updatedAt = revision.createdAt;
      }
      return Object.freeze({
        availability: "ready",
        bookId,
        title: novel.title,
        synopsis: novel.synopsis,
        status: novel.status,
        storageState: "available",
        volumeCount: volumes.length,
        chapterCount: chapters.length,
        characterCount,
        linkedProjectId,
        linkedProjectCount,
        updatedAt,
        lastOpenedAt: book.lastOpenedAt?.toISOString() ?? null,
      });
    } finally {
      lease.close();
    }
  }

  private createUnavailable(
    book: BookRecord,
    linkedProjectId: string | null,
    linkedProjectCount: number,
    reason: string,
    storageState: "missing" | "importing" | "trashed" | "corrupted" = book.state as Exclude<BookRecord["state"], "available">,
  ): UnavailableBookshelfBookCard {
    return Object.freeze({
      availability: "unavailable",
      bookId: book.id,
      storageState,
      linkedProjectId,
      linkedProjectCount,
      lastOpenedAt: book.lastOpenedAt?.toISOString() ?? null,
      reason,
    });
  }
}
