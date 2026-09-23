import { createOutlineTools } from "../outline/index.ts";
import type BookToolContext from "./BookToolContext.ts";
import { createBookChapterContentTools } from "./editChapterContent.ts";
import { createBookChapterGenerationTools } from "./generateChapterContent.ts";
import { createBookMutationTools } from "./mutateBook.ts";
import { createBookReadTools } from "./readBook.ts";
import { createNovelPassageTools } from "./searchNovelPassages.ts";

export function createBookTools(context: BookToolContext) {
  return [
    ...createBookReadTools(context),
    ...createNovelPassageTools(context),
    ...createBookMutationTools(context),
    ...createBookChapterContentTools(context),
    ...createBookChapterGenerationTools(context),
    ...createOutlineTools(() => {
      if (!context.openOutline) throw new Error("The current project does not contain a book.");
      return context.openOutline();
    }, context.projectId),
  ];
}

export { default as BookToolContext } from "./BookToolContext.ts";
