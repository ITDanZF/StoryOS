import { tool } from "langchain";
import { z } from "zod";
import type OutlineApplication from "../../../application/outline/OutlineApplication.ts";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createOutlineCheckTools(openOutline: () => OutlineApplication, projectId: string) {
  return [
    tool(
      async ({ include_semantic }) =>
        stringify(
          await openOutline().runOutlineChecks({
            projectId,
            includeSemantic: include_semantic,
          }),
        ),
      {
        name: "check_narrative_outline",
        description: "Run deterministic outline checks. Semantic suggestions are included only when include_semantic is true.",
        schema: z.object({ include_semantic: z.boolean() }),
      },
    ),
  ];
}
