import { afterEach, describe, expect, it } from "vitest";
import type { GenerateChapterInput } from "../books/ChapterGenerationService.ts";
import SqliteOutlineStore from "../../storage/book/SqliteOutlineStore.ts";
import OutlineApplication from "./OutlineApplication.ts";
import { eventNode, openOutlineBook, type OutlineBook } from "./outlineFixture.ts";

const books: OutlineBook[] = [];
afterEach(() => { for (const book of books.splice(0)) book.close(); });

function harness(failSecondOnce = false, beforeGenerate?: (input: GenerateChapterInput) => Promise<void>) {
  const book = openOutlineBook();
  books.push(book);
  const calls: GenerateChapterInput[] = [];
  let failed = false;
  const outline = new OutlineApplication(new SqliteOutlineStore(book.database.handle), {
    model: null,
    chapterGeneration: {
      generate: async (input: GenerateChapterInput) => {
        calls.push(input);
        await beforeGenerate?.(input);
        if (failSecondOnce && calls.length === 2 && !failed) {
          failed = true;
          throw new Error("model unavailable");
        }
        const current = book.database.handle.prepare("SELECT current_revision_id AS revisionId FROM chapters WHERE id=?")
          .get(input.chapterId) as { revisionId: string | null };
        const prior = book.database.handle.prepare("SELECT COUNT(*) AS count FROM chapter_revisions WHERE chapter_id=?")
          .get(input.chapterId) as { count: number };
        const revisionId = `revision-generated-${calls.length}`;
        book.database.handle.prepare(`INSERT INTO chapter_revisions(
          id,chapter_id,revision_number,parent_revision_id,document_hash,text_hash,extractor_version,character_count,origin,device_id,source_run_id,restored_from_revision_id,change_summary,created_at
        ) VALUES(?,?,?,?,?,?,1,4,'agent','device',?,NULL,'生成',?)`)
          .run(revisionId, input.chapterId, prior.count + 1, current.revisionId, `doc-${calls.length}`, `text-${calls.length}`, input.sourceRunId, Date.now());
        book.database.handle.prepare("INSERT INTO revision_documents(revision_id,document_schema_version,document_json,plain_text) VALUES(?,1,'{}','生成内容')")
          .run(revisionId);
        book.database.handle.prepare("UPDATE chapters SET current_revision_id=?,row_version=row_version+1 WHERE id=?")
          .run(revisionId, input.chapterId);
        return { generationId: `generation-${calls.length}`, revisionId, chapterId: input.chapterId,
          revisionNumber: prior.count + 1, characterCount: 4, generatedCharacterCount: 4 };
      },
    } as never,
  });
  const created = outline.createOutline({ projectId: book.projectId, title: "总纲", premise: "故事", theme: "", coreConflict: "", climaxSummary: "", endingIntent: "" });
  return { book, outline, created, calls };
}

function secondChapter(book: OutlineBook): string {
  const id = "chapter-second";
  const now = Date.now();
  book.database.handle.prepare("INSERT INTO chapters(id,book_id,title,status,position,created_at,updated_at) VALUES(?,?,'第二章','draft',2,?,?)")
    .run(id, book.bookId, now, now);
  return id;
}

function savedButUncheckpointed(book: OutlineBook, chapterId: string, stepId: string): string {
  const revisionId = `recovered-${crypto.randomUUID()}`;
  const prior = book.database.handle.prepare("SELECT COUNT(*) AS count FROM chapter_revisions WHERE chapter_id=?")
    .get(chapterId) as { count: number };
  const current = book.database.handle.prepare("SELECT current_revision_id AS revisionId FROM chapters WHERE id=?")
    .get(chapterId) as { revisionId: string | null };
  book.database.handle.prepare(`INSERT INTO chapter_revisions(
    id,chapter_id,revision_number,parent_revision_id,document_hash,text_hash,extractor_version,character_count,origin,device_id,source_run_id,restored_from_revision_id,change_summary,created_at
  ) VALUES(?,?,?,?,'recovered-doc','recovered-text',1,4,'agent','device',?,NULL,'生成',?)`)
    .run(revisionId, chapterId, prior.count + 1, current.revisionId, stepId, Date.now());
  book.database.handle.prepare("INSERT INTO revision_documents(revision_id,document_schema_version,document_json,plain_text) VALUES(?,1,'{}','生成内容')")
    .run(revisionId);
  book.database.handle.prepare("UPDATE chapters SET current_revision_id=?,row_version=row_version+1 WHERE id=?")
    .run(revisionId, chapterId);
  return revisionId;
}

describe("graph writing plan", () => {
  it("groups a cross-chapter node into two chapter steps and resumes only unfinished work", async () => {
    const { book, outline, created, calls } = harness(true);
    const secondId = secondChapter(book);
    const node = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: created.outline.revision,
      operations: [{ type: "create_node", tempId: "event", value: eventNode() }],
    } }).snapshot.nodes[0]!;
    const first = outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: 2, chapterId: book.chapterId,
      mappings: [{ nodeId: node.id, segmentIntent: "设伏", expectedLocalChange: "开始怀疑" }] });
    outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: first.outline.revision, chapterId: secondId,
      mappings: [{ nodeId: node.id, segmentIntent: "兑现", expectedLocalChange: "揭露真相" }] });

    const plan = await outline.previewGraphWritingPlan({ projectId: book.projectId, scope: { kind: "node", id: node.id } });
    expect(plan.steps.map((step) => step.chapterId)).toEqual([book.chapterId, secondId]);
    expect(plan.steps[0]?.mode).toBe("append");
    expect(plan.steps[0]?.instruction).toContain("开始怀疑");
    expect(plan.steps[1]?.instruction).toContain("揭露真相");
    const partial = await outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    expect(partial.status).toBe("partial");
    expect(partial.steps.map((step) => step.state)).toEqual(["saved", "failed"]);
    expect(calls).toHaveLength(2);
    expect(book.database.handle.prepare("SELECT source_run_id AS sourceRunId FROM chapter_revisions WHERE id=?").get(partial.steps[0]?.savedRevisionId))
      .toEqual({ sourceRunId: plan.steps[0]?.stepId });

    const completed = await outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    expect(completed.steps.map((step) => ({ state: step.state, errorCode: step.errorCode }))).toEqual([
      { state: "saved", errorCode: undefined }, { state: "saved", errorCode: undefined },
    ]);
    expect(completed).toMatchObject({ status: "completed", steps: [{ state: "saved" }, { state: "saved" }] });
    expect(calls).toHaveLength(3);
    expect(calls[2]?.chapterId).toBe(secondId);
    expect(outline.getLatestGraphWritingPlan(book.projectId)?.status).toBe("completed");
  });

  it("generates one step for a chapter that contains two stage events", async () => {
    const { book, outline, created } = harness();
    const stage = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "stage", value: eventNode({ kind: "arc", title: "开端" }) }],
    } }).snapshot.nodes[0]!;
    const nodes = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 2,
      operations: [
        { type: "create_node", tempId: "a", value: eventNode({ parentId: stage.id, title: "事件甲" }) },
        { type: "create_node", tempId: "b", value: eventNode({ parentId: stage.id, title: "事件乙" }) },
      ],
    } }).snapshot.nodes.filter((node) => node.parentId === stage.id);
    let revision = 3;
    for (const node of nodes) {
      const next = outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: revision,
        chapterId: book.chapterId, mappings: [{ nodeId: node.id, segmentIntent: "推进", expectedLocalChange: "变化" }] });
      revision = next.outline.revision;
    }
    const plan = await outline.previewGraphWritingPlan({ projectId: book.projectId, scope: { kind: "stage", id: stage.id } });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.nodeIds).toHaveLength(2);
  });

  it("recovers a saved revision without generating the chapter again", async () => {
    const { book, outline, created, calls } = harness();
    const node = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "event", value: eventNode() }],
    } }).snapshot.nodes[0]!;
    outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: 2, chapterId: book.chapterId,
      mappings: [{ nodeId: node.id, segmentIntent: "埋下线索", expectedLocalChange: "开始怀疑" }] });
    const plan = await outline.previewGraphWritingPlan({ projectId: book.projectId, scope: { kind: "node", id: node.id } });
    const revisionId = savedButUncheckpointed(book, book.chapterId, plan.steps[0]!.stepId);

    const recovered = await outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    expect(calls).toHaveLength(0);
    expect(recovered.status).toBe("completed");
    expect(recovered.steps[0]).toMatchObject({ state: "saved", savedRevisionId: revisionId });
    expect(outline.getOutlineSnapshot(book.projectId)?.mappings[0]).toMatchObject({
      coverageStatus: "drafted", verificationChapterRevisionId: revisionId,
    });
  });

  it("recovers when coverage was saved before the plan checkpoint", async () => {
    const { book, outline, created, calls } = harness();
    const node = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "event", value: eventNode() }],
    } }).snapshot.nodes[0]!;
    outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: 2, chapterId: book.chapterId,
      mappings: [{ nodeId: node.id, segmentIntent: "埋下线索", expectedLocalChange: "开始怀疑" }] });
    const plan = await outline.previewGraphWritingPlan({ projectId: book.projectId, scope: { kind: "node", id: node.id } });
    const revisionId = savedButUncheckpointed(book, book.chapterId, plan.steps[0]!.stepId);
    outline.markNodesPendingVerification({ projectId: book.projectId, expectedRevision: plan.outlineRevision,
      chapterId: book.chapterId, chapterRevisionId: revisionId, nodeIds: [node.id] });

    const recovered = await outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    expect(calls).toHaveLength(0);
    expect(recovered.status).toBe("completed");
    expect(recovered.outlineRevision).toBe(plan.outlineRevision + 1);
    expect(recovered.steps[0]).toMatchObject({ state: "saved", savedRevisionId: revisionId });
  });

  it("cancels an active generation before saving its chapter", async () => {
    let started: () => void = () => undefined;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const { book, outline, created, calls } = harness(false, async (input) => {
      started();
      await new Promise<void>((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    });
    const node = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "event", value: eventNode() }],
    } }).snapshot.nodes[0]!;
    outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: 2, chapterId: book.chapterId,
      mappings: [{ nodeId: node.id, segmentIntent: "设伏", expectedLocalChange: "开始怀疑" }] });
    const plan = await outline.previewGraphWritingPlan({ projectId: book.projectId, scope: { kind: "node", id: node.id } });
    const running = outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    await startedPromise;
    outline.cancelGraphWritingPlan({ projectId: book.projectId, planId: plan.planId });
    const cancelled = await running;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.steps[0]?.state).toBe("cancelled");
    expect(calls).toHaveLength(1);
    expect(book.database.handle.prepare("SELECT COUNT(*) AS count FROM chapter_revisions WHERE source_run_id=?")
      .get(plan.steps[0]?.stepId)).toEqual({ count: 0 });
  });

  it("repairs coverage after prose was saved without generating again", async () => {
    const { book, outline, created, calls } = harness();
    const node = outline.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "event", value: eventNode() }],
    } }).snapshot.nodes[0]!;
    outline.mapOutlineNodes({ projectId: book.projectId, expectedRevision: 2, chapterId: book.chapterId,
      mappings: [{ nodeId: node.id, segmentIntent: "设伏", expectedLocalChange: "开始怀疑" }] });
    const plan = await outline.previewGraphWritingPlan({ projectId: book.projectId, scope: { kind: "node", id: node.id } });
    book.database.handle.exec("CREATE TRIGGER fail_coverage BEFORE UPDATE ON outlines BEGIN SELECT RAISE(ABORT,'coverage write failed'); END");
    const partial = await outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    expect(partial.status).toBe("partial");
    expect(partial.steps[0]).toMatchObject({ state: "saved", errorCode: "coverage_pending" });
    expect(calls).toHaveLength(1);
    book.database.handle.exec("DROP TRIGGER fail_coverage");

    const repaired = await outline.startGraphWritingPlan({ projectId: book.projectId, planId: plan.planId, previewDigest: plan.previewDigest });
    expect(repaired.status).toBe("completed");
    expect(repaired.steps[0]).toMatchObject({ state: "saved", errorCode: undefined });
    expect(calls).toHaveLength(1);
    expect(outline.getOutlineSnapshot(book.projectId)?.mappings[0]?.coverageStatus).toBe("drafted");
  });
});
