import type { BookshelfBookCard } from "../../../shared/agent/contracts.ts";

type ReadyBook = Extract<BookshelfBookCard, { availability: "ready" }>;

export const BOOK_STATUS_LABELS = {
  planning: "构思中",
  writing: "写作中",
  completed: "已完成",
  archived: "已归档",
} as const;

export const BOOK_STORAGE_LABELS = {
  missing: "存储缺失",
  importing: "正在导入",
  trashed: "已移入回收站",
  corrupted: "数据损坏",
} as const;

export function filterBooks(
  books: readonly BookshelfBookCard[],
  query: string,
): readonly BookshelfBookCard[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  return books.filter((book) => {
    if (!normalizedQuery) return true;
    const searchable = book.availability === "ready"
      ? `${book.title} ${book.synopsis} ${book.bookId}`
      : `${book.bookId} ${book.reason}`;
    return searchable.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
  });
}

export function selectFeaturedBook(
  books: readonly BookshelfBookCard[],
): ReadyBook | null {
  return books
    .filter((book): book is ReadyBook =>
      book.availability === "ready" &&
      book.linkedProjectId !== null &&
      book.lastOpenedAt !== null)
    .sort((left, right) => {
      if (left.availability !== "ready" || right.availability !== "ready") {
        return left.bookId.localeCompare(right.bookId);
      }
      const timeOrder = (right.lastOpenedAt ?? "")
        .localeCompare(left.lastOpenedAt ?? "");
      return timeOrder || left.bookId.localeCompare(right.bookId);
    })[0] ?? null;
}

export function calculateBookshelfTotals(
  books: readonly BookshelfBookCard[],
) {
  return books.reduce((totals, book) => {
    if (book.availability !== "ready") return totals;
    return {
      chapters: totals.chapters + book.chapterCount,
      characters: totals.characters + book.characterCount,
    };
  }, { chapters: 0, characters: 0 });
}

export function formatCharacterCount(value: number): string {
  if (value < 10_000) return value.toLocaleString("zh-CN");
  const formatted = (value / 10_000).toFixed(1).replace(/\.0$/, "");
  return `${formatted} 万`;
}

export function formatRelativeTime(
  isoDate: string,
  now = Date.now(),
): string {
  const time = Date.parse(isoDate);
  if (!Number.isFinite(time)) return "时间未知";
  const elapsed = Math.max(0, now - time);
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  if (elapsed < 172_800_000) return "昨天";
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(time));
}

export function createSafeBookFileName(title: string): string {
  const withoutControlCharacters = Array.from(title, (character) =>
    (character.codePointAt(0) ?? 0) < 32 ? "-" : character).join("");
  const safeTitle = withoutControlCharacters
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim() || "StoryOS-书籍";
  return `${safeTitle}.storyos-book`;
}
