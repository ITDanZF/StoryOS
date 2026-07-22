import { stat } from "node:fs/promises";

export type ReadFileState = {
  content: string;
  mtimeMs: number;
  partial: boolean;
};

const readFileState = new Map<string, ReadFileState>();

export function rememberReadFile(
  absolutePath: string,
  content: string,
  mtimeMs: number,
  partial: boolean,
) {
  readFileState.set(absolutePath, {
    content,
    mtimeMs: Math.floor(mtimeMs),
    partial,
  });
}

export function updateReadFileState(absolutePath: string, content: string, mtimeMs: number) {
  rememberReadFile(absolutePath, content, mtimeMs, false);
}

export async function assertFileFreshForWrite(
  absolutePath: string,
  currentContent: string,
) {
  const state = readFileState.get(absolutePath);
  if (!state) {
    throw new Error("File has not been read yet. Read it before editing or overwriting it.");
  }

  if (state.partial) {
    throw new Error("Only part of the file was read. Read the whole file before editing or overwriting it.");
  }

  const fileStat = await stat(absolutePath);
  const currentMtimeMs = Math.floor(fileStat.mtimeMs);
  if (currentMtimeMs > state.mtimeMs && currentContent !== state.content) {
    throw new Error("File changed after it was read. Read it again before editing or overwriting it.");
  }
}
