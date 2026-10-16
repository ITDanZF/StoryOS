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
    mappings: [{ nodeId, segmentIntent: "本章夜探城门", expectedLocalChange: "从侧门离开" }],
  });
  return { nodeId, revision: mapped.outline.revision };
}

describe("event graph handoff", () => {
  it("keeps a cross-chapter event writable after the first chapter is verified", async () => {
    const { book, outline } = harness();
    const { nodeId } = confirmLeaf(outline, book.projectId, book.chapterId);
    const nextChapterId = "next-chapter";
    const now = Date.now();
    book.database.handle.prepare(
      "INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at) VALUES (?, ?, '第二章', 'draft', 2, ?, ?)",
    ).run(nextChapterId, book.bookId, now, now);
    const mapped = outline.mapOutlineNodes({
      projectId: book.projectId,
      expectedRevision: outline.getOutlineSnapshot(book.projectId)?.outline.revision ?? -1,
      chapterId: nextChapterId,
      mappings: [{ nodeId, segmentIntent: "第二章公开信件", expectedLocalChange: "确认背叛者" }],
    });
    const pending = outline.markNodesPendingVerification({
      projectId: book.projectId,
      expectedRevision: mapped.outline.revision,
      chapterId: book.chapterId,
      nodeIds: [nodeId],
      chapterRevisionId: book.revisionId,
    });
    const verified = outline.updateOutlineNode({
      projectId: book.projectId,
      expectedRevision: pending.outline.revision,
      nodeId,
      changes: { status: "covered" },
      coverageVerification: { chapterId: book.chapterId, chapterRevisionId: book.revisionId },
    }).snapshot;
    expect(verified.nodes.find((node) => node.id === nodeId)?.status).toBe("writing");
    expect(verified.mappings.find((item) => item.chapterId === book.chapterId)?.coverageStatus).toBe("verified");
    expect(verified.mappings.find((item) => item.chapterId === nextChapterId)?.coverageStatus).toBe("planned");
    const nextHandoff = await outline.loadEventGraphHandoff({
      projectId: book.projectId, chapterId: nextChapterId, selection: [nodeId],
    });
    expect(nextHandoff.status).toBe("ready");
    if (nextHandoff.status === "ready") {
      expect(nextHandoff.instruction).toContain("本章片段：第二章公开信件");
      expect(nextHandoff.instruction).toContain("本章结束时变化：确认背叛者");
    }
  });

  it("rejects a preview after the target chapter revision changes", async () => {
    const { book, outline, calls } = harness({ generate: async () => {
      throw new Error("generation should not run");
    } });
    const { nodeId } = confirmLeaf(outline, book.projectId, book.chapterId);
    const handoff = await outline.loadEventGraphHandoff({
      projectId: book.projectId, chapterId: book.chapterId, selection: [nodeId],
    });
    if (handoff.status !== "ready") throw new Error("handoff not ready");
    book.database.handle.prepare("UPDATE chapters SET current_revision_id = NULL WHERE id = ?").run(book.chapterId);
    await expect(outline.startChapterWriting({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [nodeId],
      mode: "append",
      expectedHandoff: handoff,
    })).rejects.toThrow("写作指导已变化，请重新预览");
    expect(calls).toEqual([]);
  });

  it("runs the saved premise through proposal, chapter handoff, writing, and verification", async () => {
    const model: ModelGateway = {
      stream: async function* () { yield await Promise.reject(new Error("stream should not run")); },
      invokeText: async () => JSON.stringify({
        summary: "主角先取得线索",
        operations: [{ type: "create_node", tempId: "lead", value: eventNode({ title: "找到密信" }) }],
      }),
    };
    const { book, outline, calls } = harness({
      model,
      generate: async (input) => ({
        generationId: "generation-1",
        chapterId: input.chapterId,
        revisionNumber: 2,
        characterCount: 2,
        generatedCharacterCount: 2,
      }),
    });
    const created = outline.createOutline({
      projectId: book.projectId,
      title: "山中来信",
      premise: "主角寻找失踪的弟弟",
      theme: "信任",
      coreConflict: "家族阻拦",
      climaxSummary: "公开真相",
      endingIntent: "和解",
    });
    const proposal = await outline.proposeOutline({ projectId: book.projectId, planningMode: "sequential", parentNodeId: null });
    expect(proposal.status).toBe("draft");
    expect(outline.getOutlineSnapshot(book.projectId)?.nodes).toEqual([]);
    if (proposal.status !== "draft") throw new Error("proposal missing");
    const accepted = outline.applyOutlinePatch({ projectId: book.projectId, patch: proposal.patch }).snapshot;
    const nodeId = accepted.nodes[0]?.id;
    if (!nodeId) throw new Error("accepted node missing");
    expect(accepted.outline.premise).toBe(created.outline.premise);
    const mapped = outline.mapOutlineNodes({
      projectId: book.projectId,
      expectedRevision: accepted.outline.revision,
      chapterId: book.chapterId,
      mappings: [{ nodeId, segmentIntent: "本章取得线索", expectedLocalChange: "找到密信" }],
    });
    const handoff = await outline.loadEventGraphHandoff({ projectId: book.projectId, chapterId: book.chapterId, selection: [nodeId] });
    if (handoff.status !== "ready") throw new Error("handoff not ready");
    expect(handoff.outlineRevision).toBe(mapped.outline.revision);
    const written = await outline.startChapterWriting({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [nodeId],
      mode: "append",
      expectedHandoff: handoff,
    });
    expect(written.status).toBe("written");
    expect(calls[0]?.instruction).toBe(handoff.instruction);
    const pending = outline.getOutlineSnapshot(book.projectId);
    if (!pending) throw new Error("pending snapshot missing");
    expect(pending.nodes.find((node) => node.id === nodeId)?.status).toBe("writing");
    const covered = outline.updateOutlineNode({
      projectId: book.projectId,
      expectedRevision: pending.outline.revision,
      nodeId,
      changes: { status: "covered" },
      coverageVerification: { chapterId: book.chapterId, chapterRevisionId: book.revisionId },
    }).snapshot;
    expect(covered.mappings.find((mapping) => mapping.nodeId === nodeId)?.verificationOutlineRevision).toBe(covered.outline.revision);
  });

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
      expectedHandoff: handoff,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.instruction).toBe(handoff.instruction);
    expect(written).toMatchObject({ status: "written", handoff });
    const saved = outline.getOutlineSnapshot(book.projectId);
    expect(saved?.nodes.find((node) => node.id === nodeId)?.status).toBe("writing");
    expect(saved?.nodes.some((node) => node.status === "covered")).toBe(false);
  });

  it("refuses to write when the confirmed handoff is no longer current", async () => {
    const { book, outline, calls } = harness({
      generate: async () => { throw new Error("generation should not run"); },
    });
    const { nodeId } = confirmLeaf(outline, book.projectId, book.chapterId);
    const handoff = await outline.loadEventGraphHandoff({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [nodeId],
    });
    if (handoff.status !== "ready") throw new Error("expected ready handoff");
    outline.updateOutlineProfile({
      projectId: book.projectId,
      expectedRevision: handoff.outlineRevision,
      title: "总纲",
      premise: "新的故事前提",
      theme: "",
      coreConflict: "",
      climaxSummary: "",
      endingIntent: "",
    });
    await expect(outline.startChapterWriting({
      projectId: book.projectId,
      chapterId: book.chapterId,
      selection: [nodeId],
      mode: "append",
      expectedHandoff: handoff,
    })).rejects.toThrow("写作指导已变化，请重新预览");
    expect(calls).toEqual([]);
  });

  it("keeps checked leaves current while confirming coverage one by one", () => {
    const { book, outline } = harness();
    const first = confirmLeaf(outline, book.projectId, book.chapterId);
    const existing = outline.getOutlineSnapshot(book.projectId);
    if (!existing) throw new Error("outline missing");
    const secondPatch = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: existing.outline.id,
        expectedRevision: existing.outline.revision,
        operations: [{ type: "create_node", tempId: "second", value: eventNode({ title: "对质", storyOrder: 2000, narrativeOrder: 2000 }) }],
      },
    });
    const secondId = secondPatch.snapshot.nodes.find((node) => node.title === "对质")?.id;
    if (!secondId) throw new Error("second leaf missing");
    const mapped = outline.mapOutlineNodes({
      projectId: book.projectId,
      expectedRevision: secondPatch.snapshot.outline.revision,
      chapterId: book.chapterId,
      mappings: [{ nodeId: secondId, segmentIntent: "本章对质", expectedLocalChange: "完成对质" }],
    });
    const pending = outline.markNodesPendingVerification({
      projectId: book.projectId,
      expectedRevision: mapped.outline.revision,
      chapterId: book.chapterId,
      nodeIds: [first.nodeId, secondId],
      chapterRevisionId: book.revisionId,
    });
    expect(() => outline.updateOutlineNode({
      projectId: book.projectId,
      expectedRevision: pending.outline.revision,
      nodeId: first.nodeId,
      changes: { status: "covered" },
      coverageVerification: { chapterId: book.chapterId, chapterRevisionId: "old-revision" },
    })).toThrow("覆盖所依据的大纲或章节修订已不是当前修订");
    const firstConfirmed = outline.updateOutlineNode({
      projectId: book.projectId,
      expectedRevision: pending.outline.revision,
      nodeId: first.nodeId,
      changes: { status: "covered" },
      coverageVerification: { chapterId: book.chapterId, chapterRevisionId: book.revisionId },
    }).snapshot;
    expect(firstConfirmed.mappings.filter((mapping) => [first.nodeId, secondId].includes(mapping.nodeId))
      .map((mapping) => mapping.verificationOutlineRevision)).toEqual([
      firstConfirmed.outline.revision,
      firstConfirmed.outline.revision,
    ]);
    const secondConfirmed = outline.updateOutlineNode({
      projectId: book.projectId,
      expectedRevision: firstConfirmed.outline.revision,
      nodeId: secondId,
      changes: { status: "needs_revision" },
      coverageVerification: { chapterId: book.chapterId, chapterRevisionId: book.revisionId },
    }).snapshot;
    expect(secondConfirmed.mappings.filter((mapping) => [first.nodeId, secondId].includes(mapping.nodeId))
      .every((mapping) => mapping.verificationOutlineRevision === secondConfirmed.outline.revision)).toBe(true);
    const changed = outline.updateOutlineNode({
      projectId: book.projectId,
      expectedRevision: secondConfirmed.outline.revision,
      nodeId: first.nodeId,
      changes: { outcome: "改成另一个结果" },
    }).snapshot;
    expect(changed.mappings.find((mapping) => mapping.nodeId === first.nodeId)?.verificationOutlineRevision)
      .toBe(secondConfirmed.outline.revision);
    expect(changed.outline.revision).toBeGreaterThan(secondConfirmed.outline.revision);
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
      stream: async function* () { yield await Promise.reject(new Error("stream should not run")); },
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
        stream: async function* () { yield await Promise.reject(new Error("stream should not run")); },
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
