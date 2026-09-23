import { tool } from "langchain";
import { z } from "zod";
import type OutlineApplication from "../../../application/outline/OutlineApplication.ts";
import { createOutlineCheckTools } from "./checkOutline.ts";
import { createOutlineMutationTools } from "./proposeOutlinePatch.ts";
import { createOutlineReadTools } from "./readOutline.ts";

export function createOutlineTools(openOutline: () => OutlineApplication, projectId: string) {
  return [
    ...createOutlineReadTools(openOutline, projectId),
    ...createOutlineCheckTools(openOutline, projectId),
    ...createOutlineMutationTools(openOutline, projectId),
  ];
}

export function createUnavailableOutlineTools() {
  const fail = () => {
    throw new Error("The current project does not contain a book.");
  };
  return createOutlineTools(fail, "unavailable");
}

export function createUnavailableChapterWriterTool() {
  return tool(async () => {
    throw new Error("The current project does not contain a book.");
  }, {
    name: "generate_book_chapter_content",
    description: "Generate chapter prose. Unavailable until a project book is open.",
    schema: z.object({
      chapter_id: z.string().min(1),
      mode: z.enum(["append", "rewrite"]),
      instruction: z.string().min(1).max(4000),
    }),
  });
}
