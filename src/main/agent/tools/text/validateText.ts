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
import { calculateTextStats } from "./textStats.ts";

const regexRuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  message: z.string().min(1),
  must_match: z.boolean().optional(),
  case_sensitive: z.boolean().optional(),
});

type ValidationIssue = {
  readonly rule: string;
  readonly message: string;
  readonly start?: ReturnType<typeof offsetToPosition>;
  readonly end?: ReturnType<typeof offsetToPosition>;
};

const MAX_VALIDATION_ISSUES = 500;

function termMatcher(term: string, caseSensitive: boolean): RegExp {
  return new RegExp(escapeRegExp(term), caseSensitive ? "g" : "gi");
}

export function createValidateTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      required_terms = [],
      forbidden_terms = [],
      case_sensitive = false,
      min_characters,
      max_characters,
      min_words,
      max_words,
      max_paragraph_characters,
      regex_rules = [],
      markdown_heading_hierarchy = false,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      const content = source.content;
      const stats = calculateTextStats(content);
      const issues: ValidationIssue[] = [];
      const addIssue = (issue: ValidationIssue) => {
        if (issues.length < MAX_VALIDATION_ISSUES) issues.push(issue);
      };

      for (const term of required_terms) {
        if (!termMatcher(term, case_sensitive).test(content)) {
          addIssue({
            rule: "required_term",
            message: `Required term is missing: ${term}`,
          });
        }
      }
      for (const term of forbidden_terms) {
        for (const match of content.matchAll(termMatcher(term, case_sensitive))) {
          addIssue({
            rule: "forbidden_term",
            message: `Forbidden term found: ${term}`,
            start: offsetToPosition(content, match.index),
            end: offsetToPosition(content, match.index + match[0].length),
          });
        }
      }

      const wordCount = stats.cjk_characters + stats.latin_words;
      const numericRules: Array<{
        readonly enabled: boolean;
        readonly failed: boolean;
        readonly rule: string;
        readonly message: string;
      }> = [
        {
          enabled: min_characters !== undefined,
          failed: stats.characters < (min_characters ?? 0),
          rule: "min_characters",
          message: `Text has ${stats.characters} characters; minimum is ${min_characters}.`,
        },
        {
          enabled: max_characters !== undefined,
          failed: stats.characters > (max_characters ?? Number.POSITIVE_INFINITY),
          rule: "max_characters",
          message: `Text has ${stats.characters} characters; maximum is ${max_characters}.`,
        },
        {
          enabled: min_words !== undefined,
          failed: wordCount < (min_words ?? 0),
          rule: "min_words",
          message: `Text has ${wordCount} counted words; minimum is ${min_words}.`,
        },
        {
          enabled: max_words !== undefined,
          failed: wordCount > (max_words ?? Number.POSITIVE_INFINITY),
          rule: "max_words",
          message: `Text has ${wordCount} counted words; maximum is ${max_words}.`,
        },
      ];
      for (const rule of numericRules) {
        if (rule.enabled && rule.failed) {
          addIssue({ rule: rule.rule, message: rule.message });
        }
      }

      if (max_paragraph_characters !== undefined) {
        for (const match of content.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)) {
          if (match[0].length <= max_paragraph_characters) continue;
          addIssue({
            rule: "max_paragraph_characters",
            message:
              `Paragraph has ${match[0].length} characters; maximum is ${max_paragraph_characters}.`,
            start: offsetToPosition(content, match.index),
            end: offsetToPosition(content, match.index + match[0].length),
          });
        }
      }

      for (const rule of regex_rules) {
        const matcher = new RegExp(
          rule.pattern,
          rule.case_sensitive ? "g" : "gi",
        );
        const matches = [...content.matchAll(matcher)];
        const mustMatch = rule.must_match ?? true;
        if (mustMatch && matches.length === 0) {
          addIssue({ rule: rule.id, message: rule.message });
        }
        if (!mustMatch) {
          for (const match of matches) {
            addIssue({
              rule: rule.id,
              message: rule.message,
              start: offsetToPosition(content, match.index),
              end: offsetToPosition(content, match.index + match[0].length),
            });
          }
        }
      }

      if (markdown_heading_hierarchy) {
        let previousLevel = 0;
        for (const match of content.matchAll(/^(#{1,6})\s+.+$/gm)) {
          const level = match[1].length;
          if (previousLevel > 0 && level > previousLevel + 1) {
            addIssue({
              rule: "markdown_heading_hierarchy",
              message:
                `Markdown heading jumps from level ${previousLevel} to level ${level}.`,
              start: offsetToPosition(content, match.index),
              end: offsetToPosition(content, match.index + match[0].length),
            });
          }
          previousLevel = level;
        }
      }

      return stringifyTextToolResult({
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        result: {
          valid: issues.length === 0,
          issue_count: issues.length,
          issues,
          issues_truncated: issues.length >= MAX_VALIDATION_ISSUES,
          stats,
        },
        warnings: issues.length >= MAX_VALIDATION_ISSUES
          ? [`Validation issues were truncated at ${MAX_VALIDATION_ISSUES}.`]
          : [],
      });
    },
    {
      name: "validate_text",
      description: [
        "Validate deterministic text rules including required or forbidden terms, length limits, paragraph limits, regular expressions, and Markdown heading hierarchy.",
        "Returns structured issues with exact positions when available.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        required_terms: z.array(z.string().min(1)).max(100).optional(),
        forbidden_terms: z.array(z.string().min(1)).max(100).optional(),
        case_sensitive: z.boolean().optional(),
        min_characters: z.number().int().min(0).optional(),
        max_characters: z.number().int().min(0).optional(),
        min_words: z.number().int().min(0).optional(),
        max_words: z.number().int().min(0).optional(),
        max_paragraph_characters: z.number().int().positive().optional(),
        regex_rules: z.array(regexRuleSchema).max(100).optional(),
        markdown_heading_hierarchy: z.boolean().optional(),
      }),
    },
  );
}
