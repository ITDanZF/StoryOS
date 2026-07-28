import type {
  IndexedTextChunk,
  IndexedTextFile,
  RankedTextHit,
} from "./types.ts";

export type TextIndexSearchOptions = {
  readonly paths?: readonly string[];
  readonly glob?: string;
  readonly limit?: number;
};

export type TextIndexFileState = {
  readonly path: string;
  readonly revision: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
};

export interface TextIndexStore {
  listFileStates(): readonly TextIndexFileState[];
  updateFileState(state: TextIndexFileState): void;
  replaceFile(file: IndexedTextFile, state: TextIndexFileState): void;
  deleteFilesNotIn(paths: ReadonlySet<string>): void;
  search(
    query: string,
    options?: TextIndexSearchOptions,
  ): readonly RankedTextHit[];
  getChunks(
    paths?: readonly string[],
    glob?: string,
  ): readonly IndexedTextChunk[];
  getNeighbors(
    chunk: IndexedTextChunk,
    radius: number,
  ): readonly IndexedTextChunk[];
}
