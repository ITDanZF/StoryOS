import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { calculateTextRevision } from "../common/revision.ts";
import { addLineNumbers, readTextFile, sliceLines, truncateResult } from "../common/text.ts";

export function createReadFileTool(context: WorkspaceToolContext) {
  return tool(
    async ({ path, offset, limit }) => {
      const absolutePath = await context.paths.resolveExisting(path);
      const { content, lineEnding, mtimeMs, size } = await readTextFile(absolutePath);
      const range = sliceLines(content, offset, limit);
      const numberedContent = addLineNumbers(range.selectedLines, range.startLine);
      const truncated = truncateResult(numberedContent);
      const partial = range.partial || truncated.truncated;

      context.files.remember(absolutePath, content, mtimeMs, partial);

      return [
        `File: ${context.paths.toRelative(absolutePath)}`,
        `Size: ${size} bytes`,
        `Revision: ${calculateTextRevision(content, lineEnding)}`,
        `Lines: ${range.selectedLines.length}/${range.totalLines}`,
        partial ? "Partial: true" : "Partial: false",
        "",
        truncated.content || "<empty file>",
        truncated.truncated
          ? "\n[Result truncated. Use offset and limit to read a smaller range.]"
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
    {
      name: "read_file",
      description:
        "Read a text file inside the agent workspace. Use offset and limit for large files. The result includes line numbers.",
      schema: z.object({
        path: z.string().describe("File path, relative to the workspace or absolute inside it."),
        offset: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("1-based first line to read."),
        limit: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("Maximum number of lines to read."),
      }),
    },
  );
}
