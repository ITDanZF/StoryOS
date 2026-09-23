import { afterEach, describe, expect, it } from "vitest";
import type { ModelGateway } from "../../../agent/model/ModelGateway.ts";
import type { GenerateChapterInput } from "../books/ChapterGenerationService.ts";
import { NovelVectorQueryError } from "../vectors/searchNovelVectors.ts";
import SqliteOutlineStore from "../../storage/book/SqliteOutlineStore.ts";
import { WAIVED_MAINLINE_INSTRUCTION } from "./OutlineContextBuilder.ts";
import OutlineApplication from "./OutlineApplication.ts";
import { eventNode, openOutlineBook, type OutlineBook } from "./outlineFixture.ts";

const books: OutlineBook[] = [];

afterEach(() => {
  for (const book of books.splice(0)) book.close();
});

function harness(options?: {
  readonly model?: ModelGateway | null;
  readonly generate?: (input: GenerateChapterInput) => Promise<{
    generationId: string;
    chapterId: string;
    revisionNumber: number;
    characterCount: number;
    generatedCharacterCount: number;
  }>;
  readonly retrieveEvidence?: (bookId: string, chapterId: string, query: string) => Promise<never>;
}) {
  const book = openOutlineBook();
  books.push(book);
  const calls: GenerateChapterInput[] = [];
  const generate = options?.generate;
  const outline = new OutlineApplication(new SqliteOutlineStore(book.database.handle), {
    model: options?.model ?? null,
    chapterGeneration: generate
      ? ({
          generate: async (input: GenerateChapterInput) => {
            calls.push(input);
            return generate(input);
          },
        } as never)
      : null,
    retrieveEvidence: options?.retrieveEvidence,
  });
  return { book, outline, calls };
}

function confirmLeaf(outline: OutlineApplication, projectId: string, chapterId: string) {
  const created = outline.createOutline({
    projectId,
    title: "总纲",
    premise: "前提",
    theme: "主题",
    coreConflict: "冲突",
    climaxSummary: "高潮",
    endingIntent: "结局",
  });
  const applied = outline.applyOutlinePatch({
    projectId,
    patch: {
      outlineId: created.outline.id,
      expectedRevision: created.outline.revision,
      operations: [{ type: "create_node", tempId: "leaf", value: eventNode() }],
    },
  });
  const nodeId = applied.snapshot.nodes[0]?.id;
  if (!nodeId) throw new Error("leaf missing");
  const mapped = outline.mapOutlineNodes({
    projectId,
    expectedRevision: applied.snapshot.outline.revision,
    chapterId,
    nodeIds: [nodeId],
  });
  return { nodeId, revision: mapped.outline.revision };
}

describe("event graph handoff", () => {
  it("distinguishes a missing outline from a chapter without an accepted leaf", async () => {
    const { book, outline } = harness();
    await expect(
      outline.loadEventGraphHandoff({ projectId: book.projectId, chapterId: book.chapterId, selection: [] }),
    ).resolves.toEqual({ status: "missing", reason: "no-outline", chapterId: book.chapterId });
    outline.createOutline({
      projectId: book.projectId,
      title: "总纲",
      premise: "",
      theme: "主题",
      coreConflict: "冲突",
      climaxSummary: "",
      endingIntent: "结局",
    });
    await expect(
      outline.loadEventGraphHandoff({ projectId: book.projectId, chapterId: book.chapterId, selection: [] }),
    ).resolves.toEqual({ status: "missing", reason: "no-accepted-leaf", chapterId: book.chapterId });
  });

  it("invalidates a waiver after the outline revision changes", async () => {
    const { book, outline } = harness();
    const created = outline.createOutline({
      projectId: book.projectId,
      title: "总纲",
      premise: "",
      theme: "主题",
      coreConflict: "冲突",
      climaxSummary: "",
      endingIntent: "结局",
    });
    const waived = outline.waiveChapterMainline({ projectId: book.projectId, chapterId: book.chapterId });
    expect(waived.status).toBe("waived");
    outline.updateOutlineProfile({
      projectId: book.projectId,
      expectedRevision: created.outline.revision,
      title: "总纲",
      premise: "",
      theme: "新主题",
      coreConflict: "冲突",
      climaxSummary: "",
      endingIntent: "结局",
    });
    await expect(
      outline.loadEventGraphHandoff({ projectId: book.projectId, chapterId: book.chapterId, selection: [] }),
    ).resolves.toMatchObject({ status: "missing", reason: "no-accepted-leaf" });
  });

  it("does not start chapter writing until the user chooses", async () => {
    const { book, outline, calls } = harness({
      generate: async (input) => ({
        generationId: "generation-1",
        chapterId: input.chapterId,
        revisionNumber: 2,
        characterCount: 2,
        generatedCharacterCount: 2,
      }),
    });
    await expect(
      outline.startChapterWriting({
        projectId: book.projectId,
        chapterId: book.chapterId,
        selection: [],
        mode: "append",
      }),
    ).resolves.toEqual({ status: "choice", reason: "no-outline", chapterId: book.chapterId });
    expect(calls).toEqual([]);
  });

  it("writes with the handoff instruction and marks leaves pending verification", async () => {
    const { book, outline, calls } = harness({
      generate: async (input) => ({
        generationId: "generation-1",
        chapterId: input.chapterId,
        revisionNumber: 2,
        characterCount: 2,
        generatedCharacterCount: 2,
      }),
    });
    const { nodeId } = confirmLeaf(outline, book.projectId, book.chapterId);
    const handoff = await outline.loadEventGraphHandoff({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [nodeId],
    });
    if (handoff.status !== "ready") throw new Error("expected ready handoff");
    const written = await outline.startChapterWriting({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [nodeId],
      mode: "rewrite",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.instruction).toBe(handoff.instruction);
    expect(written).toMatchObject({ status: "written", handoff });
    const saved = outline.getOutlineSnapshot(book.projectId);
    expect(saved?.nodes.find((node) => node.id === nodeId)?.status).toBe("writing");
    expect(saved?.nodes.some((node) => node.status === "covered")).toBe(false);
  });

  it("writes a waived mainline without marking leaves", async () => {
    const { book, outline, calls } = harness({
      generate: async (input) => ({
        generationId: "generation-1",
        chapterId: input.chapterId,
        revisionNumber: 2,
        characterCount: 2,
        generatedCharacterCount: 2,
      }),
    });
    await outline.startChapterWriting({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [],
      mode: "append",
      decision: "continue",
    });
    expect(calls[0]?.instruction).toBe(WAIVED_MAINLINE_INSTRUCTION);
    expect(calls[0]?.instruction).toContain("没有事件主线");
    expect(outline.getOutlineSnapshot(book.projectId)).toBeNull();
  });

  it("asks the event graph for a proposal and does not save it", async () => {
    const model: ModelGateway = {
      invokeText: async () =>
        JSON.stringify({
          summary: "补一层",
          operations: [{ type: "create_node", tempId: "temp-1", value: eventNode({ title: "候选" }) }],
        }),
    };
    const { book, outline, calls } = harness({
      model,
      generate: async () => {
        throw new Error("generation should not run");
      },
    });
    const result = await outline.startChapterWriting({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [],
      mode: "append",
      decision: "generate-events",
    });
    expect(result.status).toBe("event-graph");
    expect(calls).toEqual([]);
    expect(outline.getOutlineSnapshot(book.projectId)).toBeNull();
  });

  it("returns too-large without calling generation", async () => {
    const { book, outline, calls } = harness({
      generate: async () => {
        throw new Error("generation should not run");
      },
    });
    const { nodeId, revision } = confirmLeaf(outline, book.projectId, book.chapterId);
    book.database.handle
      .prepare("UPDATE outlines SET core_conflict = ? WHERE revision = ?")
      .run("冲".repeat(4000), revision);
    await expect(
      outline.loadEventGraphHandoff({
        projectId: book.projectId,
        chapterId: book.chapterId,
        selection: [nodeId],
      }),
    ).resolves.toEqual({ status: "too-large", chapterId: book.chapterId });
    await expect(
      outline.startChapterWriting({
        projectId: book.projectId,
        chapterId: book.chapterId,
        selection: [nodeId],
        mode: "append",
      }),
    ).resolves.toEqual({ status: "too-large", chapterId: book.chapterId });
    expect(calls).toEqual([]);
  });

  it("rethrows vector index errors instead of returning an empty hit list", async () => {
    const { book, outline } = harness({
      retrieveEvidence: async () => {
        throw new NovelVectorQueryError("Novel vector index is rebuilding.");
      },
    });
    const { nodeId } = confirmLeaf(outline, book.projectId, book.chapterId);
    await expect(
      outline.buildChapterContext({
        projectId: book.projectId,
        chapterId: book.chapterId,
        selection: [nodeId],
      }),
    ).rejects.toThrow("Novel vector index is rebuilding.");
  });

  it("does not turn a model failure into an empty patch", async () => {
    const { book, outline } = harness({
      model: {
        invokeText: async () => {
          throw new Error("provider unavailable");
        },
      },
    });
    outline.createOutline({
      projectId: book.projectId,
      title: "总纲",
      premise: "",
      theme: "主题",
      coreConflict: "冲突",
      climaxSummary: "",
      endingIntent: "结局",
    });
    await expect(
      outline.proposeOutline({ projectId: book.projectId, planningMode: "climax-first", parentNodeId: null }),
    ).rejects.toThrow("provider unavailable");
    expect(outline.getOutlineSnapshot(book.projectId)?.nodes).toEqual([]);
  });
});
