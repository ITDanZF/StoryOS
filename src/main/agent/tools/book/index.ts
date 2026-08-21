import type BookToolContext from "./BookToolContext.ts";
import { createBookReadTools } from "./readBook.ts";
import { createBookMutationTools } from "./mutateBook.ts";

export function createBookTools(context: BookToolContext) {
  return [
    ...createBookReadTools(context),
    ...createBookMutationTools(context),
  ];
}

export { default as BookToolContext } from "./BookToolContext.ts";
