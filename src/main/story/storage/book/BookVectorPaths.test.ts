import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getBookLayout } from "./BookLayout.ts";
import { getBookVectorPaths } from "./BookVectorPaths.ts";

describe("book vector paths", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("keeps metadata and the embedding space inside the book root", () => {
    const agentHome = mkdtempSync(path.join(tmpdir(), "storyos-vectors-"));
    dirs.push(agentHome);
    const layout = getBookLayout(agentHome, `book_${randomUUID()}`);
    const paths = getBookVectorPaths(layout.rootPath, "text-embedding-v4-1024");

    expect(paths.metadataPath).toBe(path.join(layout.rootPath, "vectors", "metadata.sqlite"));
    expect(paths.spacePath).toBe(path.join(layout.rootPath, "vectors", "text-embedding-v4-1024"));
    expect(path.relative(layout.rootPath, paths.spacePath).startsWith("..")).toBe(false);
  });

  it("rejects a space id that is not the current embedding space", () => {
    const agentHome = mkdtempSync(path.join(tmpdir(), "storyos-vectors-"));
    dirs.push(agentHome);
    const layout = getBookLayout(agentHome, `book_${randomUUID()}`);

    expect(() => getBookVectorPaths(layout.rootPath, "../outside")).toThrow(/Invalid novel vector space/);
    expect(() => getBookVectorPaths(layout.rootPath, "text-embedding-v4-999")).toThrow(
      /Invalid novel vector space/,
    );
  });

  it("rejects a symbolic link inside the book vector directory", () => {
    const agentHome = mkdtempSync(path.join(tmpdir(), "storyos-vectors-"));
    const outside = mkdtempSync(path.join(tmpdir(), "storyos-vectors-outside-"));
    dirs.push(agentHome, outside);
    const layout = getBookLayout(agentHome, `book_${randomUUID()}`);
    mkdirSync(layout.rootPath, { recursive: true });
    symlinkSync(outside, path.join(layout.rootPath, "vectors"), "junction");

    expect(() => getBookVectorPaths(layout.rootPath, "text-embedding-v4-1024")).toThrow(/symbolic link/);
  });
});
