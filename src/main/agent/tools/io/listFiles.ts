import path from "node:path";
import { tool } from "langchain";
import { z } from "zod";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "../common/limits.ts";
import { resolveExistingWorkspacePath, toWorkspaceRelativePath } from "../common/path.ts";
import { wildcardToRegExp } from "../common/text.ts";
import { walkFiles } from "../common/walk.ts";

export const listFilesTool = tool(
  async ({ path: searchPath, pattern, recursive = true, limit = DEFAULT_LIST_LIMIT }) => {
    const absolutePath = await resolveExistingWorkspacePath(searchPath);
    const cappedLimit = Math.min(limit, MAX_LIST_LIMIT);
    const matcher = pattern ? wildcardToRegExp(pattern) : null;
    const files = await walkFiles(absolutePath, {
      recursive,
      limit: cappedLimit + 1,
    });

    const matchedFiles = files
      .map((file) => toWorkspaceRelativePath(file))
      .filter((relativePath) => {
        if (!matcher) {
          return true;
        }

        return matcher.test(relativePath) || matcher.test(path.basename(relativePath));
      })
      .sort();

    const visibleFiles = matchedFiles.slice(0, cappedLimit);

    return [
      `Found ${visibleFiles.length}${matchedFiles.length > cappedLimit ? "+" : ""} file(s).`,
      ...visibleFiles,
      matchedFiles.length > cappedLimit
        ? `[Results truncated at ${cappedLimit}. Use a narrower path or pattern.]`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
  {
    name: "list_files",
    description:
      "List files inside the workspace. Supports a simple wildcard pattern such as *.ts or src/**/*.ts.",
    schema: z.object({
      path: z
        .string()
        .optional()
        .describe("Directory or file path. Defaults to the workspace root."),
      pattern: z
        .string()
        .optional()
        .describe("Optional wildcard pattern matched against relative paths or basenames."),
      recursive: z.boolean().optional().describe("Whether to recurse into subdirectories. Defaults to true."),
      limit: z.number().int().positive().max(MAX_LIST_LIMIT).optional().describe("Maximum files to return."),
    }),
  },
);
