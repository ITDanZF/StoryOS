import { describe, expect, it } from "vitest";
import type { BookshelfBookCard } from "../../src/shared/agent/contracts.ts";
import { selectAttachableBooks } from "../../src/renderer/features/project/projectBookOptions.ts";

const readyBook = (
  bookId: string,
  linkedProjectCount = 0,
): Extract<BookshelfBookCard, { availability: "ready" }> => ({
  availability: "ready",
  bookId,
  title: bookId,
  synopsis: "",
  status: "writing",
  storageState: "available",
  volumeCount: 1,
  chapterCount: 2,
  characterCount: 3,
  linkedProjectId: linkedProjectCount > 0 ? "project-1" : null,
  linkedProjectCount,
  updatedAt: "2026-08-31T10:00:00.000Z",
  lastOpenedAt: null,
});

describe("project bookshelf options", () => {
  it("returns only readable books that have no writable project", () => {
    const unavailable: BookshelfBookCard = {
      availability: "unavailable",
      bookId: "missing",
      storageState: "missing",
      linkedProjectId: null,
      linkedProjectCount: 0,
      lastOpenedAt: null,
      reason: "missing",
    };

    expect(selectAttachableBooks([
      readyBook("available"),
      readyBook("already-linked", 1),
      unavailable,
    ]).map((book) => book.bookId)).toEqual(["available"]);
  });
});
