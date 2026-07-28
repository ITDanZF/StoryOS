import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WorkspaceToolContext from "../../src/main/agent/tools/WorkspaceToolContext.ts";
import { createFindSimilarTextTool } from "../../src/main/agent/tools/text/indexing/findSimilarText.ts";
import { createRankedSearchTextTool } from "../../src/main/agent/tools/text/indexing/rankedSearchText.ts";
import { createSelectTextContextTool } from "../../src/main/agent/tools/text/indexing/selectTextContext.ts";
import TextIndexService from "../../src/main/agent/tools/text/indexing/TextIndexService.ts";
import { createSplitTextTool } from "../../src/main/agent/tools/text/splitText.ts";
import ProjectDatabase from "../../src/main/agent/storage/project/ProjectDatabase.ts";
import SqliteTextIndexStore from "../../src/main/agent/storage/project/SqliteTextIndexStore.ts";

const roots: string[] = [];
const databases: ProjectDatabase[] = [];

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-text-index-"));
  const stateRoot = path.join(root, ".storyos", "text-index");
  const database = new ProjectDatabase(
    path.join(root, ".storyos", "storyos.sqlite"),
  );
  databases.push(database);
  const textIndexStore = new SqliteTextIndexStore(database.handle);
  roots.push(root);
  return {
    root,
    stateRoot,
    database,
    context: new WorkspaceToolContext(root, stateRoot, textIndexStore),
  };
}

function parseResult<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("local text index tools", () => {
  it("persists a structural index and refreshes changed files", async () => {
    const { root, stateRoot, database, context } = createFixture();
    writeFileSync(
      path.join(root, "chapter-one.md"),
      "# Opening\n\nLin Xia begins to doubt the original decision.",
      "utf8",
    );
    mkdirSync(path.join(root, ".storyos"), { recursive: true });
    writeFileSync(
      path.join(root, ".storyos", "must-not-index.txt"),
      "private internal marker",
      "utf8",
    );
    const index = new TextIndexService(context);

    const first = await index.search("doubt decision");
    expect(first[0]?.chunk.path).toBe("chapter-one.md");
    expect(existsSync(path.join(stateRoot, "index.json"))).toBe(false);
    expect(database.handle.prepare(
      "SELECT count(*) AS count FROM indexed_files",
    ).get()).toEqual({ count: 1 });
    expect(
      (await index.getChunks()).some((chunk) =>
        chunk.path.includes(".storyos"),
      ),
    ).toBe(false);

    writeFileSync(
      path.join(root, "chapter-one.md"),
      "# Opening\n\nLin Xia finally chooses the lighthouse route.",
      "utf8",
    );
    expect(await index.search("doubt decision")).toHaveLength(0);
    expect((await index.search("lighthouse route"))[0]?.chunk.path).toBe(
      "chapter-one.md",
    );
  });

  it("returns ranked matches with neighboring structural chunks", async () => {
    const { root, context } = createFixture();
    writeFileSync(
      path.join(root, "plot.md"),
      [
        "# Investigation",
        "",
        "The copper key was hidden beneath the clock.",
        "",
        "## Consequence",
        "",
        "The clock stopped exactly at midnight.",
      ].join("\n"),
      "utf8",
    );
    const tool = createRankedSearchTextTool(new TextIndexService(context));
    const response = parseResult<{
      readonly result: {
        readonly match_count: number;
        readonly matches: ReadonlyArray<{
          readonly relationship: string;
          readonly path: string;
        }>;
      };
    }>(
      await tool.invoke({
        query: "copper key clock",
        include_neighbors: 1,
      }),
    );

    expect(response.result.match_count).toBeGreaterThan(0);
    expect(response.result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: "match",
          path: "plot.md",
        }),
        expect.objectContaining({
          relationship: "neighbor",
          path: "plot.md",
        }),
      ]),
    );
  });

  it("finds exact and near-duplicate text without embeddings", async () => {
    const { root, context } = createFixture();
    writeFileSync(
      path.join(root, "draft.md"),
      "# Scene\n\nThe rain struck the glass while Mara counted every bell.",
      "utf8",
    );
    const index = new TextIndexService(context);
    const tool = createFindSimilarTextTool(context, index);
    const response = parseResult<{
      readonly result: {
        readonly matches: ReadonlyArray<{
          readonly exact: boolean;
          readonly similarity: number;
          readonly candidate: { readonly path: string };
        }>;
      };
    }>(
      await tool.invoke({
        text: "The rain struck the glass while Mara counted every bell.",
        threshold: 0.8,
      }),
    );

    expect(response.result.matches[0]).toMatchObject({
      exact: true,
      similarity: 1,
      candidate: { path: "draft.md" },
    });
  });

  it("searches Chinese text with FTS5 and removes deleted files", async () => {
    const { root, database, context } = createFixture();
    const chapterPath = path.join(root, "chapter-cn.md");
    writeFileSync(
      chapterPath,
      "# 第十章\n\n林夏最终选择沿着灯塔路线前进。",
      "utf8",
    );
    const index = new TextIndexService(context);

    expect((await index.search("灯塔路线"))[0]?.chunk.path).toBe(
      "chapter-cn.md",
    );
    rmSync(chapterPath);
    expect(await index.search("灯塔路线")).toHaveLength(0);
    expect(database.handle.prepare(
      "SELECT count(*) AS count FROM text_chunks",
    ).get()).toEqual({ count: 0 });
  });

  it("assembles relevant context within the requested token budget", async () => {
    const { root, context } = createFixture();
    writeFileSync(
      path.join(root, "notes.md"),
      [
        "# Motive",
        "",
        "Mara protects the lighthouse because her brother vanished there.",
        "",
        "# Weather",
        "",
        "A storm closes the harbor road.",
      ].join("\n"),
      "utf8",
    );
    const tool = createSelectTextContextTool(new TextIndexService(context));
    const response = parseResult<{
      readonly result: {
        readonly selection_count: number;
        readonly estimated_tokens: number;
        readonly token_budget: number;
        readonly assembled_context: string;
      };
    }>(
      await tool.invoke({
        query: "Mara lighthouse brother",
        token_budget: 40,
        include_neighbors: 0,
      }),
    );

    expect(response.result.selection_count).toBeGreaterThan(0);
    expect(response.result.estimated_tokens).toBeLessThanOrEqual(
      response.result.token_budget,
    );
    expect(response.result.assembled_context).toContain(
      '<source path="notes.md"',
    );
  });

  it("splits text along document structure boundaries", async () => {
    const { context } = createFixture();
    const response = parseResult<{
      readonly result: {
        readonly chunk_count: number;
        readonly chunks: ReadonlyArray<{ readonly text: string }>;
      };
    }>(
      await createSplitTextTool(context).invoke({
        text: "# One\n\nFirst section.\n\n## Two\n\nSecond section.",
        strategy: "structure",
        max_size: 1,
      }),
    );

    expect(response.result.chunk_count).toBe(4);
    expect(response.result.chunks.map((chunk) => chunk.text)).toEqual([
      "# One",
      "First section.",
      "## Two",
      "Second section.",
    ]);
  });
});
