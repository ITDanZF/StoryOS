import path from "node:path";
import { tool } from "langchain";
import { z } from "zod";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "../common/limits.ts";
import { resolveExistingWorkspacePath, toWorkspaceRelativePath } from "../common/path.ts";
import { escapeRegExp, readTextFile, wildcardToRegExp } from "../common/text.ts";
import { walkFiles } from "../common/walk.ts";

export const searchTextTool = tool(
  async ({
    pattern,
    path: searchPath,
    glob,
    regex = false,
    case_sensitive = false,
    context = 0,
    limit = DEFAULT_SEARCH_LIMIT,
  }) => {
    const absolutePath = await resolveExistingWorkspacePath(searchPath);
    const cappedLimit = Math.min(limit, MAX_SEARCH_LIMIT);
    const fileMatcher = glob ? wildcardToRegExp(glob) : null;
    const flags = case_sensitive ? "g" : "gi";
    const matcher = new RegExp(regex ? pattern : escapeRegExp(pattern), flags);
    const files = await walkFiles(absolutePath, {
      recursive: true,
      limit: Number.POSITIVE_INFINITY,
    });
    const results: string[] = [];

    for (const file of files) {
      if (results.length >= cappedLimit) {
        break;
      }

      const relativePath = toWorkspaceRelativePath(file);
      if (
        fileMatcher &&
        !fileMatcher.test(relativePath) &&
        !fileMatcher.test(path.basename(relativePath))
      ) {
        continue;
      }

      let content: string;
      try {
        content = (await readTextFile(file)).content;
      } catch {
        continue;
      }

      const lines = content.length === 0 ? [] : content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        if (results.length >= cappedLimit) {
          break;
        }

        matcher.lastIndex = 0;
        if (!matcher.test(lines[index] ?? "")) {
          continue;
        }

        const start = Math.max(0, index - context);
        const end = Math.min(lines.length - 1, index + context);
        for (let lineIndex = start; lineIndex <= end; lineIndex += 1) {
          const linePrefix = lineIndex === index ? ":" : "-";
          results.push(`${relativePath}${linePrefix}${lineIndex + 1}: ${lines[lineIndex]}`);
          if (results.length >= cappedLimit) {
            break;
          }
        }
      }
    }

    if (results.length === 0) {
      return "No matches found.";
    }

    return [
      `Found ${results.length}${results.length >= cappedLimit ? "+" : ""} matching line(s).`,
      ...results,
      results.length >= cappedLimit
        ? `[Results truncated at ${cappedLimit}. Use a narrower path, glob, or pattern.]`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
  {
    name: "search_text",
    description:
      "Search text files inside the workspace by plain text or regular expression. Skips binary and very large files.",
    schema: z.object({
      pattern: z.string().describe("Text or regular expression to search for."),
      path: z
        .string()
        .optional()
        .describe("File or directory to search. Defaults to the workspace root."),
      glob: z.string().optional().describe("Optional wildcard filter such as *.ts or src/**/*.ts."),
      regex: z.boolean().optional().describe("Treat pattern as a regular expression. Defaults to false."),
      case_sensitive: z.boolean().optional().describe("Use case-sensitive matching. Defaults to false."),
      context: z.number().int().min(0).max(5).optional().describe("Context lines before and after each match."),
      limit: z.number().int().positive().max(MAX_SEARCH_LIMIT).optional().describe("Maximum matching lines to return."),
    }),
  },
);
