import { tool } from "langchain";
import { z } from "zod";
import { NovelVectorQueryError } from "../../../application/vectors/searchNovelVectors.ts";
import type NovelVectorPassageQuery from "../../../application/vectors/NovelVectorPassageQuery.ts";
import type BookToolContext from "./BookToolContext.ts";

const LITERAL_SEARCH = "Use search_book_chapters for a literal search.";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function requirePassages(context: BookToolContext): NovelVectorPassageQuery {
  if (!context.novelPassages) {
    throw new Error(`Novel vector index does not exist. ${LITERAL_SEARCH}`);
  }
  return context.novelPassages;
}

async function runQuery(query: () => Promise<unknown>): Promise<string> {
  try {
    return stringify({ passages: await query() });
  } catch (error) {
    if (error instanceof NovelVectorQueryError) {
      throw new Error(`${error.message} ${LITERAL_SEARCH}`);
    }
    throw error;
  }
}

export function createNovelPassageTools(context: BookToolContext) {
  const searchPassages = tool(
    async ({ query, limit, up_to_chapter_id }) =>
      runQuery(() =>
        requirePassages(context).searchPassages({
          bookId: context.requireBook().id,
          query,
          limit,
          ...(up_to_chapter_id === undefined ? {} : { upToChapterId: up_to_chapter_id }),
        }),
      ),
    {
      name: "search_novel_passages",
      description:
        "Find published passages in the current book by meaning. Use before drafting when the task depends on earlier characters, objects, promises, or events. If this tool reports an error, use search_book_chapters.",
      schema: z.object({
        query: z.string().trim().min(1),
        limit: z.number().int().positive().max(100),
        up_to_chapter_id: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Only search this chapter and chapters earlier in the outline. Omit to search the whole book."),
      }),
    },
  );

  const findSimilar = tool(
    async ({ text, limit, exclude_chapter_id }) =>
      runQuery(() =>
        requirePassages(context).findSimilarPassages({
          bookId: context.requireBook().id,
          text,
          limit,
          ...(exclude_chapter_id === undefined ? {} : { excludeChapterId: exclude_chapter_id }),
        }),
      ),
    {
      name: "find_similar_passages",
      description:
        "Find published passages similar to a piece of prose in the current book. Pass exclude_chapter_id when checking a draft of that chapter. If this tool reports an error, use search_book_chapters.",
      schema: z.object({
        text: z.string().trim().min(1),
        limit: z.number().int().positive().max(100),
        exclude_chapter_id: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Skip this chapter so a draft does not match itself."),
      }),
    },
  );

  return [searchPassages, findSimilar];
}
