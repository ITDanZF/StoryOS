import { stat } from "node:fs/promises";
import { tool } from "langchain";
import { z } from "zod";
import { assertFileFreshForWrite, updateReadFileState } from "../common/fileState.ts";
import { atomicWriteTextFile } from "../common/atomicWrite.ts";
import {
  assertSafeWorkspaceWritePath,
  resolveWorkspacePath,
  toWorkspaceRelativePath,
} from "../common/path.ts";
import { normalizeLineEndings, readTextFile, restoreLineEndings } from "../common/text.ts";

function isFileNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export const writeFileTool = tool(
  async ({ path: filePath, content }) => {
    const absolutePath = resolveWorkspacePath(filePath);
    await assertSafeWorkspaceWritePath(absolutePath);
    const normalizedContent = normalizeLineEndings(content);
    let finalContent = content;
    let operation: "created" | "updated" = "created";

    try {
      const currentFile = await readTextFile(absolutePath);
      await assertFileFreshForWrite(absolutePath, currentFile.content);
      finalContent = restoreLineEndings(normalizedContent, currentFile.lineEnding);
      operation = "updated";
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    await atomicWriteTextFile(absolutePath, finalContent);

    const fileStat = await stat(absolutePath);
    updateReadFileState(absolutePath, normalizedContent, fileStat.mtimeMs);

    return `File ${operation}: ${toWorkspaceRelativePath(absolutePath)}`;
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
