import { tool } from "langchain";
import { z } from "zod";
import type OutlineApplication from "../../../application/outline/OutlineApplication.ts";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createOutlineReadTools(openOutline: () => OutlineApplication, projectId: string) {
  return [
    tool(
      async () => stringify(openOutline().getOutlineSnapshot(projectId)),
      {
        name: "get_narrative_outline",
        description: "Read the current book's narrative event outline snapshot. This is not the volume and chapter catalog.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ chapter_id, selection }) =>
        stringify(
          await openOutline().buildChapterContext({
            projectId,
            chapterId: chapter_id,
            selection,
          }),
        ),
      {
        name: "get_chapter_outline_context",
        description: "Assemble the writing context for one chapter from accepted outline leaves. Does not modify the outline.",
        schema: z.object({
          chapter_id: z.string().min(1),
          selection: z.array(z.string().min(1)),
        }),
      },
    ),
    tool(
      async () => {
        const snapshot = openOutline().getOutlineSnapshot(projectId);
        return stringify(snapshot?.promises ?? []);
      },
      {
        name: "list_narrative_promises",
        description: "List narrative promises on the active outline.",
        schema: z.object({}),
      },
    ),
  ];
}
