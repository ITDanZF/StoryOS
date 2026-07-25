import { stat } from "node:fs/promises";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { atomicWriteTextFile } from "../common/atomicWrite.ts";
import { MAX_READ_RESULT_CHARS, MAX_TEXT_FILE_BYTES } from "../common/limits.ts";
import { calculateTextRevision } from "../common/revision.ts";
import {
  detectLineEnding,
  normalizeLineEndings,
  readTextFile,
  restoreLineEndings,
  type LineEnding,
} from "../common/text.ts";

export const textSourceFields = {
  text: z.string().optional().describe("Inline text to process. Provide either text or path, never both."),
  path: z.string().optional().describe("Text file inside the workspace. Provide either path or text, never both."),
};

export type TextSourceInput = {
  readonly text?: string;
  readonly path?: string;
};

export type LoadedTextSource =
  | {
      readonly kind: "inline";
      readonly content: string;
      readonly revision: string;
      readonly lineEnding: LineEnding;
    }
  | {
      readonly kind: "file";
      readonly content: string;
      readonly revision: string;
      readonly lineEnding: LineEnding;
      readonly absolutePath: string;
      readonly relativePath: string;
    };

export function stringifyTextToolResult(value: unknown): string {
  const response =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? { success: true, ...(value as Record<string, unknown>) }
      : { success: true, result: value };
  const result = JSON.stringify(response, null, 2);
  if (result.length > MAX_READ_RESULT_CHARS) {
    throw new Error(
      `Text tool result is too large (${result.length} characters). Maximum is ${MAX_READ_RESULT_CHARS}. Use a file source or narrower limits.`,
    );
  }
  return result;
}

export async function loadTextSource(
  context: WorkspaceToolContext,
  input: TextSourceInput,
): Promise<LoadedTextSource> {
  const hasText = input.text !== undefined;
  const hasPath = input.path !== undefined;
  if (hasText === hasPath) {
    throw new Error("Provide exactly one text source: text or path.");
  }

  if (hasText) {
    const rawContent = input.text ?? "";
    const size = Buffer.byteLength(rawContent, "utf8");
    if (size > MAX_TEXT_FILE_BYTES) {
      throw new Error(
        `Inline text is too large (${size} bytes). Maximum is ${MAX_TEXT_FILE_BYTES} bytes.`,
      );
    }
    const content = normalizeLineEndings(rawContent);
    const lineEnding = detectLineEnding(rawContent);
    return Object.freeze({
      kind: "inline",
      content,
      revision: calculateTextRevision(content, lineEnding),
      lineEnding,
    });
  }

  const absolutePath = await context.paths.resolveExisting(input.path);
  const file = await readTextFile(absolutePath);
  context.files.remember(absolutePath, file.content, file.mtimeMs, false);
  return Object.freeze({
    kind: "file",
    content: file.content,
    revision: calculateTextRevision(file.content, file.lineEnding),
    lineEnding: file.lineEnding,
    absolutePath,
    relativePath: context.paths.toRelative(absolutePath),
  });
}

export function requireExpectedRevision(
  source: LoadedTextSource,
  expectedRevision: string | undefined,
): void {
  if (source.kind !== "file") {
    return;
  }
  if (!expectedRevision) {
    throw new Error("expected_revision is required when modifying a file.");
  }
  if (expectedRevision !== source.revision) {
    throw new Error(
      `Text revision conflict for ${source.relativePath}. Read or preview the file again before modifying it.`,
    );
  }
}

export async function writeTextSource(
  context: WorkspaceToolContext,
  source: LoadedTextSource,
  normalizedContent: string,
  expectedRevision: string | undefined,
  lineEnding: LineEnding = source.lineEnding,
): Promise<{ readonly revision: string; readonly path: string }> {
  if (source.kind !== "file") {
    throw new Error("Inline text cannot be written. Use the returned content.");
  }
  requireExpectedRevision(source, expectedRevision);
  await context.files.assertFreshForWrite(source.absolutePath, source.content);
  await atomicWriteTextFile(
    source.absolutePath,
    restoreLineEndings(normalizedContent, lineEnding),
    context.paths,
  );
  const fileStat = await stat(source.absolutePath);
  context.files.update(source.absolutePath, normalizedContent, fileStat.mtimeMs);
  return Object.freeze({
    revision: calculateTextRevision(normalizedContent, lineEnding),
    path: source.relativePath,
  });
}
