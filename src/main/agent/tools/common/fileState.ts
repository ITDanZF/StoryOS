import { stat } from "node:fs/promises";

export type ReadFileState = {
  content: string;
  mtimeMs: number;
  partial: boolean;
};

export default class FileStateTracker {
  private readonly readFileState = new Map<string, ReadFileState>();

  remember(
    absolutePath: string,
    content: string,
    mtimeMs: number,
    partial: boolean,
  ): void {
    this.readFileState.set(absolutePath, {
      content,
      mtimeMs: Math.floor(mtimeMs),
      partial,
    });
  }

  update(absolutePath: string, content: string, mtimeMs: number): void {
    this.remember(absolutePath, content, mtimeMs, false);
  }

  async assertFreshForWrite(
    absolutePath: string,
    currentContent: string,
  ): Promise<void> {
    const state = this.readFileState.get(absolutePath);
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
}
