import type {
  AvailableBookshelfBookCard,
  BookshelfBookCard,
  UnavailableBookshelfBookCard,
} from "../../../../shared/contracts/books/bookshelfContracts.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import {
  BookRuntimeOpenError,
  type BookRuntimeFailureCode,
} from "../../runtime/BookRuntimeManager.ts";
import type { BookRecord } from "./bookRegistryPorts.ts";

function toUnavailableStorageState(code: BookRuntimeFailureCode): "missing" | "corrupted" {
  return code === "missing_database" || code === "storage_unavailable" ? "missing" : "corrupted";
}

export default class BookCatalogReader {
  constructor(private readonly runtimes: BookRuntimeManager) {}

  read(book: BookRecord, linkedProjectIds: readonly string[]): BookshelfBookCard {
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
      return this.readAvailable(book, linkedProjectId, linkedProjectCount);
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
    let summary = this.runtimes.readCatalog(bookId);
    if (!summary) {
      // Initial registration / recovery repairs the small read model once.
      const manifest = this.runtimes.readReaderManifest(bookId);
      summary = this.runtimes.readCatalog(bookId) ?? {
        title: manifest.book.title,
        synopsis: manifest.book.synopsis,
        writing_status: manifest.book.status,
        volume_count: manifest.volumes.length,
        chapter_count: manifest.chapters.length,
        character_count: manifest.chapters.reduce((n, c) => n + c.characterCount, 0),
        content_updated_at: Date.parse(manifest.book.updatedAt),
        source_sequence: 0,
      };
    }
    return Object.freeze({
      availability: "ready",
      bookId,
      title: summary.title,
      synopsis: summary.synopsis,
      status: summary.writing_status,
      storageState: "available",
      volumeCount: summary.volume_count,
      chapterCount: summary.chapter_count,
      characterCount: summary.character_count,
      linkedProjectId,
      linkedProjectCount,
      updatedAt: new Date(summary.content_updated_at).toISOString(),
      lastOpenedAt: book.lastOpenedAt?.toISOString() ?? null,
    });
  }

  private createUnavailable(
    book: BookRecord,
    linkedProjectId: string | null,
    linkedProjectCount: number,
    reason: string,
    storageState: "missing" | "importing" | "trashed" | "corrupted" = book.state as Exclude<
      BookRecord["state"],
      "available"
    >,
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
