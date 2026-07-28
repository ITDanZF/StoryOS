import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import type WorkspaceToolContext from "../../WorkspaceToolContext.ts";
import { calculateTextRevision } from "../../common/revision.ts";
import { readTextFile } from "../../common/text.ts";
import { walkFiles } from "../../common/walk.ts";
import { createStructuralChunks } from "./structuralChunks.ts";
import MemoryTextIndexStore from "./MemoryTextIndexStore.ts";
import { normalizeSearchText, tokenizeSearchText } from "./tokenizer.ts";
import type {
  IndexedTextChunk,
  IndexedTextFile,
  RankedTextHit,
} from "./types.ts";
import type {
  TextIndexFileState,
  TextIndexSearchOptions,
  TextIndexStore,
} from "./TextIndexStore.ts";

function createChunkId(
  relativePath: string,
  revision: string,
  index: number,
): string {
  return createHash("sha256")
    .update(`${relativePath}\0${revision}\0${index}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

export default class TextIndexService {
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly context: WorkspaceToolContext,
    private readonly store: TextIndexStore =
      context.textIndexStore ?? new MemoryTextIndexStore(),
  ) {}

  async ensureFresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async search(
    query: string,
    options: TextIndexSearchOptions = {},
  ): Promise<readonly RankedTextHit[]> {
    if (!normalizeSearchText(query)) throw new Error("Search query is required.");
    await this.ensureFresh();
    return this.store.search(query, options);
  }

  async getChunks(
    paths?: readonly string[],
    glob?: string,
  ): Promise<readonly IndexedTextChunk[]> {
    await this.ensureFresh();
    return this.store.getChunks(paths, glob);
  }

  async getNeighbors(
    chunk: IndexedTextChunk,
    radius: number,
  ): Promise<readonly IndexedTextChunk[]> {
    if (radius <= 0) return Object.freeze([]);
    await this.ensureFresh();
    return this.store.getNeighbors(chunk, radius);
  }

  private async refresh(): Promise<void> {
    const previous = new Map(
      this.store.listFileStates().map((file) => [file.path, file]),
    );
    const retainedPaths = new Set<string>();
    const absoluteFiles = await walkFiles(this.context.paths.workspaceRoot, {
      recursive: true,
      limit: Number.POSITIVE_INFINITY,
    });

    for (const absolutePath of absoluteFiles.sort()) {
      const relativePath = this.context.paths.toRelative(absolutePath);
      const previousFile = previous.get(relativePath);
      let metadata: Awaited<ReturnType<typeof stat>>;
      try {
        metadata = await stat(absolutePath);
      } catch {
        continue;
      }
      if (!metadata.isFile()) continue;
      if (
        previousFile &&
        previousFile.sizeBytes === metadata.size &&
        previousFile.mtimeMs === metadata.mtimeMs
      ) {
        retainedPaths.add(relativePath);
        continue;
      }

      let textFile: Awaited<ReturnType<typeof readTextFile>>;
      try {
        textFile = await readTextFile(absolutePath);
      } catch {
        continue;
      }
      retainedPaths.add(relativePath);
      const revision = calculateTextRevision(
        textFile.content,
        textFile.lineEnding,
      );
      const state: TextIndexFileState = Object.freeze({
        path: relativePath,
        revision,
        sizeBytes: textFile.size,
        mtimeMs: textFile.mtimeMs,
      });
      if (previousFile?.revision === revision) {
        this.store.updateFileState(state);
        continue;
      }

      const chunks = createStructuralChunks(textFile.content).map(
        (chunk, index): IndexedTextChunk =>
          Object.freeze({
            id: createChunkId(relativePath, revision, index),
            path: relativePath,
            revision,
            index,
            type: chunk.type,
            content: chunk.content,
            start: chunk.start,
            end: chunk.end,
            headingPath: chunk.headingPath,
            tokens: tokenizeSearchText(
              `${chunk.headingPath.join(" ")} ${chunk.content}`,
            ),
          }),
      );
      const indexedFile: IndexedTextFile = Object.freeze({
        path: relativePath,
        revision,
        chunks: Object.freeze(chunks),
      });
      this.store.replaceFile(indexedFile, state);
    }
    this.store.deleteFilesNotIn(retainedPaths);
  }
}
