import { stat } from "node:fs/promises";
import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { atomicWriteTextFile } from "../common/atomicWrite.ts";
import { normalizeLineEndings, readTextFile, restoreLineEndings } from "../common/text.ts";

function isFileNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createWriteFileTool(context: WorkspaceToolContext) {
  return tool(
    async ({ path: filePath, content }) => {
      const absolutePath = await context.paths.resolveForWrite(filePath);
      const normalizedContent = normalizeLineEndings(content);
      let finalContent = content;
      let operation: "created" | "updated" = "created";

      try {
        const currentFile = await readTextFile(absolutePath);
        await context.files.assertFreshForWrite(absolutePath, currentFile.content);
        finalContent = restoreLineEndings(normalizedContent, currentFile.lineEnding);
        operation = "updated";
      } catch (error) {
        if (!isFileNotFound(error)) {
          throw error;
        }
      }

      await atomicWriteTextFile(absolutePath, finalContent, context.paths);

      const fileStat = await stat(absolutePath);
      context.files.update(absolutePath, normalizedContent, fileStat.mtimeMs);

      return `File ${operation}: ${context.paths.toRelative(absolutePath)}`;
    },
    {
      name: "write_file",
      description:
        "Create a new text file or overwrite a previously read text file inside the workspace. Existing files must be read first.",
      schema: z.object({
        path: z.string().describe("File path, relative to the workspace or absolute inside it."),
        content: z.string().describe("Full file content to write."),
      }),
    },
  );
}
