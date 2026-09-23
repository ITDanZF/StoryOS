import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import NovelVectorMetadata, {
  NOVEL_VECTOR_METADATA_APPLICATION_ID,
  NOVEL_VECTOR_METADATA_VERSION,
} from "./NovelVectorMetadata.ts";
import { NOVEL_CHUNKER_VERSION } from "./chunkNovelText.ts";

const identity = {
  sourceGeneration: "generation-1",
  spaceId: "text-embedding-v4-1024",
  modelName: "text-embedding-v4" as const,
  dimensions: 1024 as const,
  metric: "cosine" as const,
  chunkerVersion: NOVEL_CHUNKER_VERSION,
};

describe("novel vector metadata", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempRoot(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "storyos-vector-meta-"));
    dirs.push(dir);
    return path.join(dir, "vectors");
  }

  it("creates a version 1 database and publishes one chapter", () => {
    const root = tempRoot();
    const metadata = NovelVectorMetadata.open(root);
    try {
      const raw = new Database(path.join(root, "metadata.sqlite"), { readonly: true, fileMustExist: true });
      try {
        expect(raw.pragma("application_id", { simple: true })).toBe(NOVEL_VECTOR_METADATA_APPLICATION_ID);
        expect(raw.pragma("user_version", { simple: true })).toBe(NOVEL_VECTOR_METADATA_VERSION);
      } finally {
        raw.close();
      }

      metadata.publishChapter(identity, {
        lastSequence: 4,
        chapterId: "chapter-1",
        revisionId: "revision-1",
        textHash: "text-hash",
        publishedAt: 10,
        chunks: [
          {
            id: "vector-1",
            chapterId: "chapter-1",
            revisionId: "revision-1",
            ordinal: 0,
            startOffset: 0,
            endOffset: 2,
            contentHash: "content-hash",
            content: "正文",
          },
        ],
      });

      expect(metadata.getIndexMeta()).toMatchObject({
        sourceGeneration: "generation-1",
        lastSequence: 4,
        state: "published",
        errorMessage: null,
      });
      expect(metadata.listPublications()).toEqual([
        {
          chapterId: "chapter-1",
          revisionId: "revision-1",
          textHash: "text-hash",
          chunkCount: 1,
          publishedAt: 10,
        },
      ]);
    } finally {
      metadata.close();
    }
  });

  it("deletes the vector directory when the metadata version does not match", () => {
    const root = tempRoot();
    const created = NovelVectorMetadata.open(root);
    created.publishChapter(identity, {
      lastSequence: 1,
      chapterId: "chapter-1",
      revisionId: "revision-1",
      textHash: "text-hash",
      publishedAt: 10,
      chunks: [],
    });
    created.close();

    const raw = new Database(path.join(root, "metadata.sqlite"));
    raw.pragma("user_version = 2");
    raw.close();
    writeFileSync(path.join(root, "old-space.txt"), "stale");

    const reopened = NovelVectorMetadata.open(root);
    try {
      expect(reopened.getIndexMeta()).toBeNull();
      expect(reopened.listPublications()).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it("rebuilds metadata when the sqlite file is unreadable", () => {
    const root = tempRoot();
    const created = NovelVectorMetadata.open(root);
    created.close();
    writeFileSync(path.join(root, "metadata.sqlite"), "not a database");

    const reopened = NovelVectorMetadata.open(root);
    try {
      expect(reopened.getIndexMeta()).toBeNull();
    } finally {
      reopened.close();
    }
  });
});
