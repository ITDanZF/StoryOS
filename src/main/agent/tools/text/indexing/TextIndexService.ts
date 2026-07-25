import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type WorkspaceToolContext from "../../WorkspaceToolContext.ts";
import { calculateTextRevision } from "../../common/revision.ts";
import { readTextFile, wildcardToRegExp } from "../../common/text.ts";
import { walkFiles } from "../../common/walk.ts";
import { createStructuralChunks } from "./structuralChunks.ts";
import { normalizeSearchText, tokenizeSearchText } from "./tokenizer.ts";
import type {
  IndexedTextChunk,
  IndexedTextFile,
  RankedTextHit,
  TextIndexSnapshot,
} from "./types.ts";

const INDEX_VERSION = 1;

type SearchOptions = {
  readonly paths?: readonly string[];
  readonly glob?: string;
  readonly limit?: number;
};

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isSnapshot(value: unknown): value is TextIndexSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TextIndexSnapshot>;
  return candidate.version === INDEX_VERSION && Array.isArray(candidate.files);
}

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

function pathMatches(
  filePath: string,
  paths: readonly string[] | undefined,
  glob: string | undefined,
): boolean {
  if (paths?.length) {
    const included = paths.some((candidate) => {
      const normalized = candidate
        .trim()
        .replaceAll("\\", "/")
        .replace(/\/+$/, "");
      return (
        normalized === "" ||
        filePath === normalized ||
        filePath.startsWith(`${normalized}/`)
      );
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

export default class TextIndexService {
  private readonly indexPath: string;
  private snapshot: TextIndexSnapshot | null = null;
  private refreshPromise: Promise<TextIndexSnapshot> | null = null;

  constructor(private readonly context: WorkspaceToolContext) {
    this.indexPath = path.join(context.textIndexRoot, "index.json");
  }

  async ensureFresh(): Promise<TextIndexSnapshot> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<readonly RankedTextHit[]> {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) throw new Error("Search query is required.");
    const snapshot = await this.ensureFresh();
    const documents = snapshot.files
      .filter((file) => pathMatches(file.path, options.paths, options.glob))
      .flatMap((file) => file.chunks);
    if (documents.length === 0) return Object.freeze([]);

    const queryTerms = [...new Set(tokenizeSearchText(query))];
    if (queryTerms.length === 0) return Object.freeze([]);
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

    const averageLength =
      documents.reduce((total, document) => total + document.tokens.length, 0) /
      documents.length;
    const k1 = 1.5;
    const b = 0.75;
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
        const inverseDocumentFrequency = Math.log(
          1 +
            (documents.length - documentFrequency + 0.5) /
              (documentFrequency + 0.5),
        );
        const normalizedFrequency =
          (frequency * (k1 + 1)) /
          (frequency +
            k1 *
              (1 -
                b +
                (b * document.tokens.length) / Math.max(1, averageLength)));
        score += inverseDocumentFrequency * normalizedFrequency;
      }

      const normalizedContent = normalizeSearchText(document.content);
      if (normalizedContent.includes(normalizedQuery)) score += 3;
      const normalizedHeading = normalizeSearchText(
        document.headingPath.join(" "),
      );
      if (normalizedHeading.includes(normalizedQuery)) score += 2;
      if (score <= 0) continue;
      hits.push(
        Object.freeze({
          chunk: document,
          score: Number(score.toFixed(4)),
          matchedTerms: Object.freeze(matchedTerms),
        }),
      );
    }

    hits.sort(
      (left, right) =>
        right.score - left.score ||
        left.chunk.path.localeCompare(right.chunk.path) ||
        left.chunk.index - right.chunk.index,
    );
    return Object.freeze(hits.slice(0, options.limit ?? 20));
  }

  async getChunks(
    paths?: readonly string[],
    glob?: string,
  ): Promise<readonly IndexedTextChunk[]> {
    const snapshot = await this.ensureFresh();
    return Object.freeze(
      snapshot.files
        .filter((file) => pathMatches(file.path, paths, glob))
        .flatMap((file) => file.chunks),
    );
  }

  async getNeighbors(
    chunk: IndexedTextChunk,
    radius: number,
  ): Promise<readonly IndexedTextChunk[]> {
    if (radius <= 0) return Object.freeze([]);
    const snapshot = await this.ensureFresh();
    const file = snapshot.files.find((item) => item.path === chunk.path);
    if (!file) return Object.freeze([]);
    return Object.freeze(
      file.chunks.filter(
        (candidate) =>
          candidate.id !== chunk.id &&
          Math.abs(candidate.index - chunk.index) <= radius,
      ),
    );
  }

  private async refresh(): Promise<TextIndexSnapshot> {
    const previous = this.snapshot ?? (await this.load());
    const previousFiles = new Map(
      previous.files.map((file) => [file.path, file]),
    );
    const absoluteFiles = await walkFiles(this.context.paths.workspaceRoot, {
      recursive: true,
      limit: Number.POSITIVE_INFINITY,
    });
    const indexedFiles: IndexedTextFile[] = [];
    let changed = false;

    for (const absolutePath of absoluteFiles.sort()) {
      let file: Awaited<ReturnType<typeof readTextFile>>;
      try {
        file = await readTextFile(absolutePath);
      } catch {
        continue;
      }
      const relativePath = this.context.paths.toRelative(absolutePath);
      const revision = calculateTextRevision(file.content, file.lineEnding);
      const previousFile = previousFiles.get(relativePath);
      if (previousFile?.revision === revision) {
        indexedFiles.push(previousFile);
        continue;
      }

      changed = true;
      const chunks = createStructuralChunks(file.content).map(
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
      indexedFiles.push(
        Object.freeze({
          path: relativePath,
          revision,
          chunks: Object.freeze(chunks),
        }),
      );
    }

    if (indexedFiles.length !== previous.files.length) changed = true;
    const snapshot: TextIndexSnapshot = Object.freeze({
      version: INDEX_VERSION,
      updatedAt: changed ? new Date().toISOString() : previous.updatedAt,
      files: Object.freeze(indexedFiles),
    });
    this.snapshot = snapshot;
    if (changed) await this.save(snapshot);
    return snapshot;
  }

  private async load(): Promise<TextIndexSnapshot> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.indexPath, "utf8"),
      );
      if (isSnapshot(parsed)) return parsed;
    } catch (error) {
      if (!isFileNotFound(error) && !(error instanceof SyntaxError))
        throw error;
    }
    return Object.freeze({
      version: INDEX_VERSION,
      updatedAt: new Date(0).toISOString(),
      files: Object.freeze([]),
    });
  }

  private async save(snapshot: TextIndexSnapshot): Promise<void> {
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const temporaryPath = `${this.indexPath}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(snapshot), {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporaryPath, this.indexPath);
    } finally {
      await rm(temporaryPath, { force: true }).catch((): void => undefined);
    }
  }
}
