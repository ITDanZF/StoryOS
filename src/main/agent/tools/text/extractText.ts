import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { escapeRegExp } from "../common/text.ts";
import { offsetToPosition } from "./ranges.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
} from "./source.ts";

export function createExtractTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      pattern,
      regex = false,
      case_sensitive = false,
      capture_group,
      deduplicate = false,
      limit = 100,
      ...sourceInput
    }) => {
      if (!pattern) {
        throw new Error("Extraction pattern cannot be empty.");
      }
      const source = await loadTextSource(context, sourceInput);
      const matcher = new RegExp(
        regex ? pattern : escapeRegExp(pattern),
        case_sensitive ? "gd" : "gid",
      );
      const matches: Array<{
        readonly value: string;
        readonly full_match: string;
        readonly start: ReturnType<typeof offsetToPosition>;
        readonly end: ReturnType<typeof offsetToPosition>;
      }> = [];
      const seen = new Set<string>();

      for (const match of source.content.matchAll(matcher)) {
        const value = capture_group === undefined
          ? match[0]
          : match[capture_group];
        if (value === undefined) {
          throw new Error(
            `Capture group ${capture_group} does not exist for a match.`,
          );
        }
        if (deduplicate && seen.has(value)) continue;
        seen.add(value);
        const fullStart = match.index;
        const groupIndex = capture_group ?? 0;
        const captureIndices = match.indices?.[groupIndex];
        if (!captureIndices) {
          throw new Error("Capture group " + groupIndex + " has no source position.");
        }
        const startOffset = captureIndices[0] ?? fullStart;
        matches.push({
          value,
          full_match: match[0],
          start: offsetToPosition(source.content, startOffset),
          end: offsetToPosition(source.content, startOffset + value.length),
        });
        if (matches.length >= limit) break;
      }

      return stringifyTextToolResult({
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        result: {
          matches,
          match_count: matches.length,
          limited: matches.length >= limit,
        },
        warnings: matches.length >= limit
          ? [`Extraction results reached the limit of ${limit}.`]
          : [],
      });
    },
    {
      name: "extract_text",
      description:
        "Extract plain-text or regular-expression matches with optional capture groups, deduplication, limits, and exact line/column positions.",
      schema: z.object({
        ...textSourceFields,
        pattern: z.string(),
        regex: z.boolean().optional(),
        case_sensitive: z.boolean().optional(),
        capture_group: z.number().int().min(0).max(100).optional(),
        deduplicate: z.boolean().optional(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    },
  );
}
