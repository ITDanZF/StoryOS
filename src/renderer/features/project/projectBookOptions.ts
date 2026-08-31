import type { BookshelfBookCard } from "../../../shared/agent/contracts.ts";

export type AttachableBookshelfBook = Extract<
  BookshelfBookCard,
  { availability: "ready" }
>;

export function selectAttachableBooks(
  books: readonly BookshelfBookCard[],
): readonly AttachableBookshelfBook[] {
  return books.filter((book): book is AttachableBookshelfBook =>
    book.availability === "ready" && book.linkedProjectCount === 0);
}
