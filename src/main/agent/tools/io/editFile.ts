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

function countOccurrences(content: string, search: string) {
  return content.split(search).length - 1;
}

export const editFileTool = tool(
  async ({ path: filePath, old_string, new_string, replace_all = false }) => {
    if (old_string === new_string) {
      throw new Error("No changes to make: old_string and new_string are identical.");
    }

    const absolutePath = resolveWorkspacePath(filePath);
    await assertSafeWorkspaceWritePath(absolutePath);
    const normalizedOld = normalizeLineEndings(old_string);
    const normalizedNew = normalizeLineEndings(new_string);

    let currentContent = "";
    let lineEnding: "LF" | "CRLF" = "LF";
    let fileExists = true;

    try {
      const currentFile = await readTextFile(absolutePath);
      currentContent = currentFile.content;
      lineEnding = currentFile.lineEnding;
      await assertFileFreshForWrite(absolutePath, currentContent);
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
      fileExists = false;
    }

    if (!fileExists && normalizedOld !== "") {
      throw new Error("File does not exist. To create it with edit_file, use an empty old_string.");
    }

    if (normalizedOld === "") {
      if (fileExists && currentContent.length > 0) {
        throw new Error("Cannot use an empty old_string on a non-empty existing file.");
      }

      const createdContent = restoreLineEndings(normalizedNew, lineEnding);
      await atomicWriteTextFile(absolutePath, createdContent);
      const fileStat = await stat(absolutePath);
      updateReadFileState(absolutePath, normalizedNew, fileStat.mtimeMs);
      return `File created: ${toWorkspaceRelativePath(absolutePath)}`;
    }

    const matches = countOccurrences(currentContent, normalizedOld);
    if (matches === 0) {
      throw new Error(`String to replace was not found in ${toWorkspaceRelativePath(absolutePath)}.`);
    }

    if (matches > 1 && !replace_all) {
      throw new Error(
        `Found ${matches} matches. Provide more context in old_string or set replace_all to true.`,
      );
    }

    const updatedContent = replace_all
      ? currentContent.replaceAll(normalizedOld, normalizedNew)
      : currentContent.replace(normalizedOld, normalizedNew);

    await atomicWriteTextFile(
      absolutePath,
      restoreLineEndings(updatedContent, lineEnding),
    );
    const fileStat = await stat(absolutePath);
    updateReadFileState(absolutePath, updatedContent, fileStat.mtimeMs);

    return `File edited: ${toWorkspaceRelativePath(absolutePath)} (${replace_all ? matches : 1} replacement${replace_all && matches !== 1 ? "s" : ""})`;
  },
  {
    name: "edit_file",
    description:
      "Edit a text file by replacing an exact string. Existing files must be read first. Use replace_all only when every match should change.",
    schema: z.object({
      path: z.string().describe("File path, relative to the workspace or absolute inside it."),
      old_string: z.string().describe("Exact text to replace. Use an empty string only to create a new file."),
      new_string: z.string().describe("Replacement text."),
      replace_all: z
        .boolean()
        .optional()
        .describe("Replace all occurrences. Defaults to false."),
    }),
  },
);
