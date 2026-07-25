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

const replacementRuleSchema = z.object({
  pattern: z.string().min(1),
  replacement: z.string(),
  regex: z.boolean().optional(),
  case_sensitive: z.boolean().optional(),
});

type ReplacementRule = z.infer<typeof replacementRuleSchema>;

function applyReplacementRule(
  content: string,
  rule: ReplacementRule,
  maximumReplacements: number,
): {
  readonly content: string;
  readonly replacements: number;
} {
  const matcher = new RegExp(
    rule.regex ? rule.pattern : escapeRegExp(rule.pattern),
    rule.case_sensitive ? "g" : "gi",
  );
  const matches = [...content.matchAll(matcher)];
  if (matches.length > maximumReplacements) {
    throw new Error(
      `Replacement rule matched ${matches.length} times, exceeding the remaining limit of ${maximumReplacements}.`,
    );
  }

  return Object.freeze({
    content: rule.regex
      ? content.replace(matcher, rule.replacement)
      : content.replace(matcher, () => rule.replacement),
    replacements: matches.length,
  });
}

export function createReplaceTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      rules,
      max_replacements = 10_000,
      expected_revision,
      preview_only = false,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      let updatedContent = source.content;
      let totalReplacements = 0;
      const ruleResults: Array<{
        readonly index: number;
        readonly replacements: number;
      }> = [];

      for (let index = 0; index < rules.length; index += 1) {
        const result = applyReplacementRule(
          updatedContent,
          rules[index],
          max_replacements - totalReplacements,
        );
        updatedContent = result.content;
        totalReplacements += result.replacements;
        ruleResults.push({
          index,
          replacements: result.replacements,
        });
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
            total_replacements: totalReplacements,
            rules: ruleResults,
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
          total_replacements: totalReplacements,
          rules: ruleResults,
        },
        warnings: [],
      });
    },
    {
      name: "replace_text",
      description: [
        "Apply ordered plain-text or regular-expression replacement rules.",
        "Regular-expression replacements support JavaScript capture substitutions such as $1 and $<name>.",
        "Plain-text replacements are always literal.",
        "File changes require expected_revision unless preview_only is true.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        rules: z.array(replacementRuleSchema).min(1).max(100),
        max_replacements: z.number().int().positive().max(100_000).optional(),
        expected_revision: z.string().optional(),
        preview_only: z.boolean().optional(),
      }),
    },
  );
}
