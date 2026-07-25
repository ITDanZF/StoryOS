import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { resolveTextRange } from "./ranges.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
  writeTextSource,
} from "./source.ts";

export function createEditTextRangeTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      start_line,
      start_column = 1,
      end_line,
      end_column = 1,
      replacement,
      expected_revision,
      preview_only = false,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      const range = resolveTextRange(source.content, {
        start: { line: start_line, column: start_column },
        end: { line: end_line, column: end_column },
      });
      const updatedContent = [
        source.content.slice(0, range.start),
        replacement,
        source.content.slice(range.end),
      ].join("");
      const changed = updatedContent !== source.content;

      if (source.kind === "inline" || preview_only || !changed) {
        return stringifyTextToolResult({
          source: source.kind,
          ...(source.kind === "file" ? { path: source.relativePath } : {}),
          preview: source.kind === "file" && preview_only,
          changed,
          revision: source.revision,
          affected_range: {
            start_line,
            start_column,
            end_line,
            end_column,
          },
          result: { content: updatedContent },
          warnings: [],
        });
      }

      const written = await writeTextSource(
        context,
        source,
        updatedContent,
        expected_revision,
      );
      return stringifyTextToolResult({
        source: "file",
        path: written.path,
        changed: true,
        revision_before: source.revision,
        revision_after: written.revision,
        affected_range: {
          start_line,
          start_column,
          end_line,
          end_column,
        },
        warnings: [],
      });
    },
    {
      name: "edit_text_range",
      description: [
        "Insert, replace, or delete text using a 1-based line/column range whose end is exclusive.",
        "Use an equal start and end for insertion, and an empty replacement for deletion.",
        "File changes require expected_revision unless preview_only is true.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        start_line: z.number().int().positive(),
        start_column: z.number().int().positive().optional(),
        end_line: z.number().int().positive(),
        end_column: z.number().int().positive().optional(),
        replacement: z.string(),
        expected_revision: z.string().optional(),
        preview_only: z.boolean().optional(),
      }),
    },
  );
}
