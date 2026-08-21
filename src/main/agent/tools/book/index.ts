import type BookToolContext from "./BookToolContext.ts";
import { createBookReadTools } from "./readBook.ts";
import { createBookMutationTools } from "./mutateBook.ts";
import { createBookChapterContentTools } from "./editChapterContent.ts";

export function createBookTools(context: BookToolContext) {
  return [
    ...createBookReadTools(context),
    ...createBookMutationTools(context),
    ...createBookChapterContentTools(context),
  ];
}

export { default as BookToolContext } from "./BookToolContext.ts";
