import { tool } from "langchain";
import { z } from "zod";
import type BookToolContext from "./BookToolContext.ts";

export function createBookChapterGenerationTools(context: BookToolContext) {
  const generation = context.chapterGeneration;
  if (!generation) return [];

  return [tool(
    async ({
      chapter_id,
      mode,
      instruction,
    }, config) => JSON.stringify(await generation.generate({
      projectId: context.projectId,
      chapterId: chapter_id,
      mode,
      instruction,
      signal: config.signal,
    }), null, 2),
    {
      name: "generate_book_chapter_content",
      description: [
        "Generate or continue a chapter through StoryOS's dedicated streaming writer and save one final revision.",
        "Use this whenever the user asks to draft, write, continue, or substantially expand fictional chapter prose; prefer it over rewrite_book_chapter_text for creative generation.",
        "Create the chapter first if it does not exist. The writer reads the latest persisted revision when execution begins and rejects concurrent changes made during generation.",
        "Use append to preserve current text and add new prose, or rewrite to replace the full chapter.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        mode: z.enum(["append", "rewrite"]),
        instruction: z.string().trim().min(1).max(4000),
      }),
    },
  )];
}
