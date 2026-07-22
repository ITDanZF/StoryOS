import { tool } from "langchain";
import { z } from "zod";
import { rememberReadFile } from "../common/fileState.ts";
import { resolveExistingWorkspacePath, toWorkspaceRelativePath } from "../common/path.ts";
import { addLineNumbers, readTextFile, sliceLines, truncateResult } from "../common/text.ts";

export const readFileTool = tool(
  async ({ path, offset, limit }) => {
    const absolutePath = await resolveExistingWorkspacePath(path);
    const { content, mtimeMs, size } = await readTextFile(absolutePath);
    const range = sliceLines(content, offset, limit);
    const numberedContent = addLineNumbers(range.selectedLines, range.startLine);
    const truncated = truncateResult(numberedContent);
    const partial = range.partial || truncated.truncated;

    rememberReadFile(absolutePath, content, mtimeMs, partial);

    return [
      `File: ${toWorkspaceRelativePath(absolutePath)}`,
      `Size: ${size} bytes`,
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
