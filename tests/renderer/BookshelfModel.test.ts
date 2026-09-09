import { describe, expect, it } from "vitest";
import type { BookshelfBookCard } from "../../src/shared/agent/contracts.ts";
import {
  calculateBookshelfTotals,
  createSafeBookFileName,
  filterBooks,
  formatCharacterCount,
  formatRelativeTime,
  selectFeaturedBook,
} from "../../src/renderer/features/bookshelf/bookshelfModel.ts";

const readyBook = (overrides: Partial<Extract<
  BookshelfBookCard,
  { availability: "ready" }
>> = {}): Extract<BookshelfBookCard, { availability: "ready" }> => ({
  availability: "ready",
  bookId: "book-1",
  title: "长夜",
  synopsis: "一场持续二十年的雨",
  status: "writing",
  storageState: "available",
  volumeCount: 1,
  chapterCount: 2,
  characterCount: 12_000,
  linkedProjectId: "project-1",
  linkedProjectCount: 1,
  updatedAt: "2026-08-30T10:00:00.000Z",
  lastOpenedAt: "2026-08-30T10:00:00.000Z",
  ...overrides,
});

describe("bookshelf model", () => {
  it("normalizes search text", () => {
    const planning = readyBook({
      bookId: "book-2",
      title: "星海无声",
      synopsis: "来自未来的信号",
      status: "planning",
    });
    expect(filterBooks([readyBook(), planning], " 未来 "))
      .toEqual([planning]);
  });

  it("selects only a linked ready book as the recent book", () => {
    const older = readyBook({ bookId: "older", lastOpenedAt: "2026-08-29T10:00:00.000Z" });
    const newer = readyBook({ bookId: "newer", lastOpenedAt: "2026-08-30T10:00:00.000Z" });
    const unlinked = readyBook({ bookId: "unlinked", linkedProjectId: null, linkedProjectCount: 0, lastOpenedAt: "2026-08-31T10:00:00.000Z" });
    expect(selectFeaturedBook([older, unlinked, newer])?.bookId).toBe("newer");
  });

  it("excludes unavailable books from totals", () => {
    const unavailable: BookshelfBookCard = {
      availability: "unavailable",
      bookId: "missing",
      storageState: "missing",
      linkedProjectId: null,
      linkedProjectCount: 0,
      lastOpenedAt: null,
      reason: "missing",
    };
    expect(calculateBookshelfTotals([readyBook(), unavailable]))
      .toEqual({ chapters: 2, characters: 12_000 });
  });

  it("formats counts, relative times, and safe export names", () => {
    expect(formatCharacterCount(12_000)).toBe("1.2 万");
    expect(formatRelativeTime("2026-08-31T09:59:30.000Z", Date.parse("2026-08-31T10:00:00.000Z"))).toBe("刚刚");
    expect(createSafeBookFileName("长夜:雨? ")).toBe("长夜-雨-.storyos-book");
  });
});
