import { tool } from "langchain";
import { z } from "zod";
import type BookToolContext from "./BookToolContext.ts";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createBookReadTools(context: BookToolContext) {
  const getOutline = tool(
    async () => {
      const book = context.requireBook();
      const volumes = context.novels.listVolumes(book.id);
      const chapters = context.novels.listChapters(book.id);
      return stringify({
        projectId: context.projectId,
        book,
        volumes: volumes.map((volume) => ({
          ...volume,
          chapters: chapters.filter((chapter) => chapter.volumeId === volume.id),
        })),
        unassignedChapters: chapters.filter((chapter) => chapter.volumeId === null),
      });
    },
    {
      name: "get_book_outline",
      description: "Read the current project's book profile, volumes, and chapter outline.",
      schema: z.object({}),
    },
  );

  const readChapter = tool(
    async ({ chapter_id }) => {
      const book = context.requireBook();
      const chapter = context.novels.getChapter(chapter_id);
      if (chapter.novelId !== book.id) {
        throw new Error(`Chapter does not belong to the current book: ${chapter_id}`);
      }
      const metadata = context.novels.getCurrentRevisionMetadata(chapter.id);
      if (!metadata) {
        return stringify({
          chapter,
          revision: null,
          text: "",
        });
      }
      const text = context.novels.getCurrentRevisionPlainText(chapter.id);
      if (text === null) {
        throw new Error(`Current chapter revision text is missing: ${chapter.id}`);
      }
      return stringify({
        chapter,
        revision: {
          id: metadata.id,
          revisionNumber: metadata.revisionNumber,
          characterCount: metadata.characterCount,
          changeSummary: metadata.changeSummary,
          createdAt: metadata.createdAt,
        },
        text,
      });
    },
    {
      name: "read_book_chapter",
      description: "Read one chapter and its current persisted text from the current project book.",
      schema: z.object({
        chapter_id: z.string().min(1).describe("Chapter id from get_book_outline."),
      }),
    },
  );

  const searchChapters = tool(
    async ({ query, limit = 20 }) => {
      const book = context.requireBook();
      const matches = context.novels.searchChapterPlainText(book.id, query.trim(), limit);
      return stringify({ query, matches, truncated: matches.length >= limit });
    },
    {
      name: "search_book_chapters",
      description: "Search the persisted text of all chapters in the current project book.",
      schema: z.object({
        query: z.string().trim().min(1),
        limit: z.number().int().positive().max(100).optional(),
      }),
    },
  );

  const getStatistics = tool(
    async () => {
      const book = context.requireBook();
      const chapters = context.novels.listChapterSummaries(book.id);
      return stringify({
        bookId: book.id,
        volumeCount: context.novels.listVolumes(book.id).length,
        chapterCount: chapters.length,
        characterCount: chapters.reduce((total, chapter) => total + chapter.characterCount, 0),
        chapters: chapters.map((chapter) => ({
          chapterId: chapter.id,
          title: chapter.title,
          status: chapter.status,
          characterCount: chapter.characterCount,
          revisionNumber: chapter.revisionNumber,
        })),
      });
    },
    {
      name: "get_book_statistics",
      description:
        "Get chapter, volume, revision, and character-count statistics for the current book.",
      schema: z.object({}),
    },
  );

  return [getOutline, readChapter, searchChapters, getStatistics];
}
