import { tool } from "langchain";
import { z } from "zod";
import {
  decodeStoredChapterContent,
  extractTiptapText,
} from "../../../../shared/book/richText.ts";
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
      const revision = context.novels.getCurrentRevision(chapter.id);
      return stringify({
        chapter,
        revision: revision ? {
          id: revision.id,
          revisionNumber: revision.revisionNumber,
          characterCount: revision.characterCount,
          changeSummary: revision.changeSummary,
          createdAt: revision.createdAt,
        } : null,
        text: revision
          ? extractTiptapText(decodeStoredChapterContent(revision.content))
          : "",
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
      const normalizedQuery = query.trim().toLocaleLowerCase();
      const matches: Array<{
        chapterId: string;
        chapterTitle: string;
        occurrence: number;
        snippet: string;
      }> = [];
      for (const chapter of context.novels.listChapters(book.id)) {
        const revision = context.novels.getCurrentRevision(chapter.id);
        if (!revision) continue;
        const text = extractTiptapText(decodeStoredChapterContent(revision.content));
        const normalizedText = text.toLocaleLowerCase();
        let from = 0;
        while (matches.length < limit) {
          const index = normalizedText.indexOf(normalizedQuery, from);
          if (index < 0) break;
          matches.push({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            occurrence: index,
            snippet: text.slice(Math.max(0, index - 60), index + query.length + 60),
          });
          from = index + Math.max(1, normalizedQuery.length);
        }
        if (matches.length >= limit) break;
      }
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
      const chapters = context.novels.listChapters(book.id);
      const chapterStatistics = chapters.map((chapter) => {
        const revision = context.novels.getCurrentRevision(chapter.id);
        return {
          chapterId: chapter.id,
          title: chapter.title,
          status: chapter.status,
          characterCount: revision?.characterCount ?? 0,
          revisionNumber: revision?.revisionNumber ?? null,
        };
      });
      return stringify({
        bookId: book.id,
        volumeCount: context.novels.listVolumes(book.id).length,
        chapterCount: chapters.length,
        characterCount: chapterStatistics.reduce(
          (total, chapter) => total + chapter.characterCount,
          0,
        ),
        chapters: chapterStatistics,
      });
    },
    {
      name: "get_book_statistics",
      description: "Get chapter, volume, revision, and character-count statistics for the current book.",
      schema: z.object({}),
    },
  );

  return [getOutline, readChapter, searchChapters, getStatistics];
}
