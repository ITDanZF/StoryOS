import { stat } from "node:fs/promises";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { atomicWriteTextFile } from "../common/atomicWrite.ts";
import { calculateTextRevision } from "../common/revision.ts";
import {
  readTextFile,
  restoreLineEndings,
  type LineEnding,
} from "../common/text.ts";

export type TextOutputTarget = {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly exists: boolean;
  readonly content: string;
  readonly revision?: string;
  readonly lineEnding: LineEnding;
};

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function inspectTextOutputTarget(
  context: WorkspaceToolContext,
  outputPath: string,
): Promise<TextOutputTarget> {
  const absolutePath = await context.paths.resolveForWrite(outputPath);
  try {
    const file = await readTextFile(absolutePath);
    context.files.remember(absolutePath, file.content, file.mtimeMs, false);
    return Object.freeze({
      absolutePath,
      relativePath: context.paths.toRelative(absolutePath),
      exists: true,
      content: file.content,
      revision: calculateTextRevision(file.content, file.lineEnding),
      lineEnding: file.lineEnding,
    });
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
    return Object.freeze({
      absolutePath,
      relativePath: context.paths.toRelative(absolutePath),
      exists: false,
      content: "",
      lineEnding: "LF",
    });
  }
}

export async function writeTextOutput(
  context: WorkspaceToolContext,
  target: TextOutputTarget,
  normalizedContent: string,
  expectedRevision: string | undefined,
  lineEnding: LineEnding = target.lineEnding,
): Promise<{
  readonly operation: "created" | "updated";
  readonly path: string;
  readonly revision: string;
}> {
  if (target.exists) {
    if (!expectedRevision) {
      throw new Error(
        "expected_output_revision is required when overwriting an existing output file.",
      );
    }
    if (expectedRevision !== target.revision) {
      throw new Error(
        `Text revision conflict for ${target.relativePath}. Preview the merge again before writing it.`,
      );
    }
    await context.files.assertFreshForWrite(
      target.absolutePath,
      target.content,
    );
  }

  await atomicWriteTextFile(
    target.absolutePath,
    restoreLineEndings(normalizedContent, lineEnding),
    context.paths,
  );
  const fileStat = await stat(target.absolutePath);
  context.files.update(
    target.absolutePath,
    normalizedContent,
    fileStat.mtimeMs,
  );
  return Object.freeze({
    operation: target.exists ? "updated" : "created",
    path: target.relativePath,
    revision: calculateTextRevision(normalizedContent, lineEnding),
  });
}
