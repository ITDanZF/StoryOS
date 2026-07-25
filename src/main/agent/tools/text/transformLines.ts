import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { escapeRegExp } from "../common/text.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
  writeTextSource,
} from "./source.ts";

const matchOptions = {
  pattern: z.string().min(1),
  regex: z.boolean().optional(),
  case_sensitive: z.boolean().optional(),
};

const lineStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("trim"), side: z.enum(["start", "end", "both"]) }),
  z.object({ type: z.literal("remove_empty") }),
  z.object({ type: z.literal("keep_matching"), ...matchOptions }),
  z.object({ type: z.literal("remove_matching"), ...matchOptions }),
  z.object({
    type: z.literal("deduplicate"),
    case_sensitive: z.boolean().optional(),
    trim_before_compare: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("sort"),
    direction: z.enum(["ascending", "descending"]).optional(),
    case_sensitive: z.boolean().optional(),
    numeric: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("add_prefix"),
    text: z.string(),
    non_empty_only: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("add_suffix"),
    text: z.string(),
    non_empty_only: z.boolean().optional(),
  }),
]);

type LineStep = z.infer<typeof lineStepSchema>;

function createMatcher(step: {
  readonly pattern: string;
  readonly regex?: boolean;
  readonly case_sensitive?: boolean;
}): RegExp {
  return new RegExp(
    step.regex ? step.pattern : escapeRegExp(step.pattern),
    step.case_sensitive ? "" : "i",
  );
}

function applyLineStep(lines: string[], step: LineStep): string[] {
  switch (step.type) {
    case "trim":
      return lines.map((line) =>
        step.side === "start"
          ? line.trimStart()
          : step.side === "end"
            ? line.trimEnd()
            : line.trim(),
      );
    case "remove_empty":
      return lines.filter((line) => line.trim() !== "");
    case "keep_matching": {
      const matcher = createMatcher(step);
      return lines.filter((line) => matcher.test(line));
    }
    case "remove_matching": {
      const matcher = createMatcher(step);
      return lines.filter((line) => !matcher.test(line));
    }
    case "deduplicate": {
      const seen = new Set<string>();
      return lines.filter((line) => {
        let key = step.trim_before_compare ? line.trim() : line;
        if (!step.case_sensitive) key = key.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    case "sort": {
      const collator = new Intl.Collator(undefined, {
        sensitivity: step.case_sensitive ? "variant" : "base",
        numeric: step.numeric ?? false,
      });
      const sorted = [...lines].sort(collator.compare);
      return step.direction === "descending" ? sorted.reverse() : sorted;
    }
    case "add_prefix":
      return lines.map((line) =>
        step.non_empty_only && !line ? line : `${step.text}${line}`,
      );
    case "add_suffix":
      return lines.map((line) =>
        step.non_empty_only && !line ? line : `${line}${step.text}`,
      );
  }
}

export function createTransformLinesTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      steps,
      preserve_final_newline = true,
      expected_revision,
      preview_only = false,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      const hadFinalNewline = source.content.endsWith("\n");
      let lines = source.content.length === 0 ? [] : source.content.split("\n");
      if (hadFinalNewline) lines.pop();

      const stepResults: Array<{
        readonly index: number;
        readonly type: LineStep["type"];
        readonly lines_before: number;
        readonly lines_after: number;
      }> = [];
      for (let index = 0; index < steps.length; index += 1) {
        const linesBefore = lines.length;
        lines = applyLineStep(lines, steps[index]);
        stepResults.push({
          index,
          type: steps[index].type,
          lines_before: linesBefore,
          lines_after: lines.length,
        });
      }

      let updatedContent = lines.join("\n");
      if (preserve_final_newline && hadFinalNewline && lines.length > 0) {
        updatedContent += "\n";
      }
      const changed = updatedContent !== source.content;

      if (source.kind === "inline" || preview_only || !changed) {
        return stringifyTextToolResult({
          source: source.kind,
          ...(source.kind === "file" ? { path: source.relativePath } : {}),
          preview: source.kind === "file" && preview_only,
          changed,
          revision: source.revision,
          result: {
            content: updatedContent,
            lines_before: source.content
              ? source.content.split("\n").length
              : 0,
            lines_after: lines.length,
            steps: stepResults,
          },
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
        result: {
          lines_after: lines.length,
          steps: stepResults,
        },
        warnings: [],
      });
    },
    {
      name: "transform_lines",
      description: [
        "Apply an ordered pipeline of deterministic line operations.",
        "Supports trimming, filtering, deduplication, locale-aware sorting, and prefixes or suffixes.",
        "File changes require expected_revision unless preview_only is true.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        steps: z.array(lineStepSchema).min(1).max(100),
        preserve_final_newline: z.boolean().optional(),
        expected_revision: z.string().optional(),
        preview_only: z.boolean().optional(),
      }),
    },
  );
}
