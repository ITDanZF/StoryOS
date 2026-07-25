import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { restoreLineEndings, type LineEnding } from "../common/text.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
  writeTextSource,
} from "./source.ts";

function convertFullWidthAscii(content: string): string {
  return [...content].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x3000) return " ";
    if (code >= 0xff01 && code <= 0xff5e) {
      return String.fromCodePoint(code - 0xfee0);
    }
    return character;
  }).join("");
}

function limitBlankLines(content: string, maximum: number): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let consecutiveBlankLines = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      consecutiveBlankLines += 1;
      if (consecutiveBlankLines > maximum) continue;
    } else {
      consecutiveBlankLines = 0;
    }
    result.push(line);
  }
  return result.join("\n");
}

export function createNormalizeTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      unicode_form,
      trim_lines = false,
      trim_text = false,
      max_consecutive_blank_lines,
      tabs_to_spaces,
      full_width_ascii = false,
      target_line_ending = "preserve",
      expected_revision,
      preview_only = false,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      let updatedContent = source.content;

      if (unicode_form) {
        updatedContent = updatedContent.normalize(unicode_form);
      }
      if (full_width_ascii) {
        updatedContent = convertFullWidthAscii(updatedContent);
      }
      if (tabs_to_spaces !== undefined) {
        updatedContent = updatedContent.replaceAll(
          "\t",
          " ".repeat(tabs_to_spaces),
        );
      }
      if (trim_lines) {
        updatedContent = updatedContent
          .split("\n")
          .map((line) => line.trimEnd())
          .join("\n");
      }
      if (max_consecutive_blank_lines !== undefined) {
        updatedContent = limitBlankLines(
          updatedContent,
          max_consecutive_blank_lines,
        );
      }
      if (trim_text) {
        updatedContent = updatedContent.trim();
      }

      const lineEnding: LineEnding = target_line_ending === "preserve"
        ? source.lineEnding
        : target_line_ending === "crlf"
          ? "CRLF"
          : "LF";
      const lineEndingChanged = lineEnding !== source.lineEnding;
      const changed = updatedContent !== source.content || lineEndingChanged;
      const returnedContent = restoreLineEndings(updatedContent, lineEnding);

      if (source.kind === "inline" || preview_only || !changed) {
        return stringifyTextToolResult({
          source: source.kind,
          ...(source.kind === "file" ? { path: source.relativePath } : {}),
          preview: source.kind === "file" && preview_only,
          changed,
          revision: source.revision,
          result: { content: returnedContent },
          warnings: [],
        });
      }

      const written = await writeTextSource(
        context,
        source,
        updatedContent,
        expected_revision,
        lineEnding,
      );
      return stringifyTextToolResult({
        source: "file",
        path: written.path,
        changed: true,
        revision_before: source.revision,
        revision_after: written.revision,
        line_ending: lineEnding,
        warnings: [],
      });
    },
    {
      name: "normalize_text",
      description: [
        "Deterministically normalize Unicode, whitespace, blank lines, tabs, full-width ASCII, and line endings.",
        "Only explicitly enabled rules are applied.",
        "File changes require expected_revision unless preview_only is true.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        unicode_form: z.enum(["NFC", "NFKC"]).optional(),
        trim_lines: z.boolean().optional(),
        trim_text: z.boolean().optional(),
        max_consecutive_blank_lines: z.number().int().min(0).max(10).optional(),
        tabs_to_spaces: z.number().int().min(1).max(8).optional(),
        full_width_ascii: z.boolean().optional(),
        target_line_ending: z.enum(["preserve", "lf", "crlf"]).optional(),
        expected_revision: z.string().optional(),
        preview_only: z.boolean().optional(),
      }),
    },
  );
}
