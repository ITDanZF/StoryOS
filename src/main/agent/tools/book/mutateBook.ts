import { tool } from "langchain";
import { z } from "zod";
import type BookToolContext from "./BookToolContext.ts";

const novelStatus = z.enum(["planning", "writing", "completed", "archived"]);
const chapterStatus = z.enum(["outline", "draft", "revising", "completed"]);

function result(action: string, value?: unknown): string {
  return JSON.stringify({ action, success: true, ...(value ? { value } : {}) }, null, 2);
}

export function createBookMutationTools(context: BookToolContext) {
  const createBook = tool(
    async ({ title, synopsis = "", status = "planning" }) => result(
      "book_created",
      context.novels.createNovel({ title, synopsis, status }),
    ),
    {
      name: "create_project_book",
      description: "Create the single book for the current project when it does not have one.",
      schema: z.object({
        title: z.string().trim().min(1).max(200),
        synopsis: z.string().optional(),
        status: novelStatus.optional(),
      }),
    },
  );

  const updateBook = tool(
    async ({ title, synopsis, status }) => {
      const book = context.requireBook();
      return result("book_updated", context.novels.updateNovel({
        id: book.id,
        title,
        synopsis,
        status,
      }));
    },
    {
      name: "update_book_profile",
      description: "Update the current book title, synopsis, and lifecycle status.",
      schema: z.object({
        title: z.string().trim().min(1).max(200),
        synopsis: z.string(),
        status: novelStatus,
      }),
    },
  );

  const createVolume = tool(
    async ({ title, summary = "", sort_order }) => {
      const book = context.requireBook();
      return result("volume_created", context.novels.createVolume({
        novelId: book.id,
        title,
        summary,
        sortOrder: sort_order,
      }));
    },
    {
      name: "create_book_volume",
      description: "Create a volume in the current book at a zero-based sort order.",
      schema: z.object({
        title: z.string().trim().min(1).max(200),
        summary: z.string().optional(),
        sort_order: z.number().int().nonnegative(),
      }),
    },
  );

  const updateVolume = tool(
    async ({ volume_id, title, summary, sort_order }) => result(
      "volume_updated",
      context.novels.updateVolume({
        id: volume_id,
        title,
        summary,
        sortOrder: sort_order,
      }),
    ),
    {
      name: "update_book_volume",
      description: "Rename, summarize, or reorder a volume in the current book.",
      schema: z.object({
        volume_id: z.string().min(1),
        title: z.string().trim().min(1).max(200),
        summary: z.string(),
        sort_order: z.number().int().nonnegative(),
      }),
    },
  );

  const deleteVolume = tool(
    async ({ volume_id }) => {
      context.requireBook();
      context.novels.deleteVolume(volume_id);
      return result("volume_deleted", { volumeId: volume_id });
    },
    {
      name: "delete_book_volume",
      description: "Delete a volume. Its chapters become unassigned instead of being deleted.",
      schema: z.object({ volume_id: z.string().min(1) }),
    },
  );

  const createChapter = tool(
    async ({ volume_id, title, status = "outline", sort_order }) => {
      const book = context.requireBook();
      return result("chapter_created", context.novels.createChapter({
        novelId: book.id,
        volumeId: volume_id,
        title,
        status,
        sortOrder: sort_order,
      }));
    },
    {
      name: "create_book_chapter",
      description: "Create a chapter in the current book and optionally assign it to a volume.",
      schema: z.object({
        volume_id: z.string().min(1).nullable(),
        title: z.string().trim().min(1).max(200),
        status: chapterStatus.optional(),
        sort_order: z.number().int().nonnegative(),
      }),
    },
  );

  const updateChapter = tool(
    async ({ chapter_id, volume_id, title, status, sort_order }) => result(
      "chapter_updated",
      context.novels.updateChapter({
        id: chapter_id,
        volumeId: volume_id,
        title,
        status,
        sortOrder: sort_order,
      }),
    ),
    {
      name: "update_book_chapter",
      description: "Rename, move, reorder, or change the status of a chapter.",
      schema: z.object({
        chapter_id: z.string().min(1),
        volume_id: z.string().min(1).nullable(),
        title: z.string().trim().min(1).max(200),
        status: chapterStatus,
        sort_order: z.number().int().nonnegative(),
      }),
    },
  );

  const deleteChapter = tool(
    async ({ chapter_id }) => {
      context.requireBook();
      context.novels.deleteChapter(chapter_id);
      return result("chapter_deleted", { chapterId: chapter_id });
    },
    {
      name: "delete_book_chapter",
      description: "Permanently delete a chapter and all of its saved revisions.",
      schema: z.object({ chapter_id: z.string().min(1) }),
    },
  );

  return [
    createBook,
    updateBook,
    createVolume,
    updateVolume,
    deleteVolume,
    createChapter,
    updateChapter,
    deleteChapter,
  ];
}
