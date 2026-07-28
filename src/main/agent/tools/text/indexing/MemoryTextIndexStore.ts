import path from "node:path";
import { wildcardToRegExp } from "../../common/text.ts";
import {
  normalizeSearchText,
  tokenizeSearchText,
} from "./tokenizer.ts";
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

type StoredFile = {
  state: TextIndexFileState;
  file: IndexedTextFile;
};

function pathMatches(
  filePath: string,
  paths: readonly string[] | undefined,
  glob: string | undefined,
): boolean {
  if (paths?.length) {
    const included = paths.some((candidate) => {
      const normalized = candidate.trim().replaceAll("\\", "/")
        .replace(/\/+$/, "");
      return normalized === "" || filePath === normalized ||
        filePath.startsWith(`${normalized}/`);
    });
    if (!included) return false;
  }
  if (glob) {
    const matcher = wildcardToRegExp(glob);
    if (!matcher.test(filePath) && !matcher.test(path.basename(filePath))) {
      return false;
    }
  }
  return true;
}

function termFrequency(tokens: readonly string[]): ReadonlyMap<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

export { pathMatches };

export default class MemoryTextIndexStore implements TextIndexStore {
  private readonly files = new Map<string, StoredFile>();

  listFileStates(): readonly TextIndexFileState[] {
    return [...this.files.values()].map((item) => item.state);
  }

  updateFileState(state: TextIndexFileState): void {
    const existing = this.files.get(state.path);
    if (!existing) throw new Error(`Indexed file not found: ${state.path}`);
    existing.state = state;
  }

  replaceFile(file: IndexedTextFile, state: TextIndexFileState): void {
    this.files.set(file.path, { file, state });
  }

  deleteFilesNotIn(paths: ReadonlySet<string>): void {
    for (const filePath of this.files.keys()) {
      if (!paths.has(filePath)) this.files.delete(filePath);
    }
  }

  search(
    query: string,
    options: TextIndexSearchOptions = {},
  ): readonly RankedTextHit[] {
    const documents = this.getChunks(options.paths, options.glob);
    if (documents.length === 0) return Object.freeze([]);
    const normalizedQuery = normalizeSearchText(query);
    const queryTerms = [...new Set(tokenizeSearchText(query))];
    if (!normalizedQuery || queryTerms.length === 0) return Object.freeze([]);

    const documentFrequencies = new Map<string, number>();
    for (const document of documents) {
      const terms = new Set(document.tokens);
      for (const term of queryTerms) {
        if (terms.has(term)) {
          documentFrequencies.set(
            term,
            (documentFrequencies.get(term) ?? 0) + 1,
          );
        }
      }
    }
    const averageLength = documents.reduce(
      (total, document) => total + document.tokens.length,
      0,
    ) / documents.length;
    const hits: RankedTextHit[] = [];
    for (const document of documents) {
      const frequencies = termFrequency(document.tokens);
      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of queryTerms) {
        const frequency = frequencies.get(term) ?? 0;
        if (frequency === 0) continue;
        matchedTerms.push(term);
        const documentFrequency = documentFrequencies.get(term) ?? 0;
        const idf = Math.log(
          1 + (documents.length - documentFrequency + 0.5) /
            (documentFrequency + 0.5),
        );
        const normalizedFrequency = (frequency * 2.5) /
          (frequency + 1.5 *
            (0.25 + 0.75 * document.tokens.length /
              Math.max(1, averageLength)));
        score += idf * normalizedFrequency;
      }
      if (normalizeSearchText(document.content).includes(normalizedQuery)) {
        score += 3;
      }
      if (normalizeSearchText(document.headingPath.join(" "))
        .includes(normalizedQuery)) {
        score += 2;
      }
      if (score > 0) {
        hits.push(Object.freeze({
          chunk: document,
          score: Number(score.toFixed(4)),
          matchedTerms: Object.freeze(matchedTerms),
        }));
      }
    }
    hits.sort((left, right) => right.score - left.score ||
      left.chunk.path.localeCompare(right.chunk.path) ||
      left.chunk.index - right.chunk.index);
    return Object.freeze(hits.slice(0, options.limit ?? 20));
  }

  getChunks(
    paths?: readonly string[],
    glob?: string,
  ): readonly IndexedTextChunk[] {
    return Object.freeze([...this.files.values()]
      .map((item) => item.file)
      .filter((file) => pathMatches(file.path, paths, glob))
      .flatMap((file) => file.chunks));
  }

  getNeighbors(
    chunk: IndexedTextChunk,
    radius: number,
  ): readonly IndexedTextChunk[] {
    if (radius <= 0) return Object.freeze([]);
    const file = this.files.get(chunk.path)?.file;
    if (!file) return Object.freeze([]);
    return Object.freeze(file.chunks.filter((candidate) =>
      candidate.id !== chunk.id &&
      Math.abs(candidate.index - chunk.index) <= radius));
  }
}
