import path from "node:path";
import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { type LineEnding } from "../common/text.ts";
import { inspectTextOutputTarget, writeTextOutput } from "./output.ts";
import { loadTextSource, stringifyTextToolResult } from "./source.ts";

const mergeSourceSchema = z.object({
  text: z.string().optional(),
  path: z.string().optional(),
  label: z.string().min(1).optional(),
});

export function createMergeTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      sources,
      separator = "\n\n",
      trim_sources = false,
      add_source_headers = false,
      output_path,
      expected_output_revision,
      target_line_ending = "preserve",
      preview_only = false,
    }) => {
      const loadedSources = await Promise.all(
        sources.map((source) => loadTextSource(context, source)),
      );
      const sections = loadedSources.map((source, index) => {
        const input = sources[index];
        const content = trim_sources ? source.content.trim() : source.content;
        if (!add_source_headers) return content;
        const label =
          input.label ??
          (source.kind === "file"
            ? path.basename(source.relativePath)
            : `Source ${index + 1}`);
        return `# ${label}\n\n${content}`;
      });
      const mergedContent = sections.join(separator);
      const sourceSummaries = loadedSources.map((source, index) => ({
        index,
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        characters: source.content.length,
      }));

      if (!output_path) {
        return stringifyTextToolResult({
          source: "merged",
          changed: false,
          result: {
            content: mergedContent,
            source_count: loadedSources.length,
            sources: sourceSummaries,
          },
          warnings: [],
        });
      }

      const target = await inspectTextOutputTarget(context, output_path);
      const lineEnding: LineEnding =
        target_line_ending === "preserve"
          ? target.lineEnding
          : target_line_ending === "crlf"
            ? "CRLF"
            : "LF";
      if (preview_only) {
        return stringifyTextToolResult({
          source: "merged",
          preview: true,
          changed:
            mergedContent !== target.content ||
            lineEnding !== target.lineEnding,
          output: {
            path: target.relativePath,
            exists: target.exists,
            revision: target.revision,
          },
          result: {
            content: mergedContent,
            source_count: loadedSources.length,
            sources: sourceSummaries,
          },
          warnings: [],
        });
      }

      const written = await writeTextOutput(
        context,
        target,
        mergedContent,
        expected_output_revision,
        lineEnding,
      );
      return stringifyTextToolResult({
        source: "merged",
        changed: true,
        output: {
          operation: written.operation,
          path: written.path,
          revision: written.revision,
        },
        result: {
          source_count: loadedSources.length,
          sources: sourceSummaries,
        },
        warnings: [],
      });
    },
    {
      name: "merge_text",
      description: [
        "Merge ordered inline texts or workspace text files with a separator and optional source headings.",
        "Without output_path, returns merged inline content.",
        "With output_path, creates or overwrites a workspace file; existing outputs require expected_output_revision unless preview_only is true.",
      ].join(" "),
      schema: z.object({
        sources: z.array(mergeSourceSchema).min(1).max(100),
        separator: z.string().max(10_000).optional(),
        trim_sources: z.boolean().optional(),
        add_source_headers: z.boolean().optional(),
        output_path: z.string().optional(),
        expected_output_revision: z.string().optional(),
        target_line_ending: z.enum(["preserve", "lf", "crlf"]).optional(),
        preview_only: z.boolean().optional(),
      }),
    },
  );
}
