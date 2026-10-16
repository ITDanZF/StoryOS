import { afterEach, describe, expect, it } from "vitest";
import type { ModelGateway } from "../../../agent/model/ModelGateway.ts";
import type { OutlinePatchOperation } from "../../../../shared/contracts/outline/outlineContracts.ts";
import SqliteOutlineStore from "../../storage/book/SqliteOutlineStore.ts";
import OutlineApplication from "./OutlineApplication.ts";
import { assertPlanningScope } from "./outlinePlanningScope.ts";
import { eventNode, openOutlineBook, type OutlineBook } from "./outlineFixture.ts";

const books: OutlineBook[] = [];
afterEach(() => { for (const book of books.splice(0)) book.close(); });

function active(model: ModelGateway | null = null) {
  const book = openOutlineBook();
  books.push(book);
  const app = new OutlineApplication(new SqliteOutlineStore(book.database.handle), { model });
  const created = app.createOutline({
    projectId: book.projectId, title: "总纲", premise: "故事", theme: "", coreConflict: "", climaxSummary: "", endingIntent: "",
  });
  return { book, app, created };
}

describe("scoped event planning", () => {
  it("rejects a field proposal that also modifies another fact", () => {
    const { book, app, created } = active();
    const snapshot = app.applyOutlinePatch({
      projectId: book.projectId,
      patch: { outlineId: created.outline.id, expectedRevision: 1, operations: [{ type: "create_node", tempId: "node", value: eventNode() }] },
    }).snapshot;
    const nodeId = snapshot.nodes[0]!.id;
    const operation: OutlinePatchOperation = { type: "update_node", nodeId, changes: { conflict: "新阻力", outcome: "偷偷改变结果" } };
    expect(() => assertPlanningScope(snapshot, { kind: "field", nodeId, field: "conflict" }, [operation])).toThrow("字段规划超出指定范围");
    expect(() => app.applyOutlinePatch({
      projectId: book.projectId,
      scope: { kind: "field", nodeId, field: "conflict" },
      patch: { outlineId: created.outline.id, expectedRevision: snapshot.outline.revision, operations: [operation] },
    })).toThrow("字段规划超出指定范围");
    expect(app.getOutlineSnapshot(book.projectId)?.outline.revision).toBe(snapshot.outline.revision);
  });

  it("allows only the selected relation direction", () => {
    const { book, app, created } = active();
    const snapshot = app.applyOutlinePatch({
      projectId: book.projectId,
      patch: { outlineId: created.outline.id, expectedRevision: 1, operations: [
        { type: "create_node", tempId: "a", value: eventNode({ title: "A" }) },
        { type: "create_node", tempId: "b", value: eventNode({ title: "B" }) },
      ] },
    }).snapshot;
    const [a, b] = snapshot.nodes;
    expect(() => assertPlanningScope(snapshot, { kind: "relation", sourceNodeId: a!.id, targetNodeId: b!.id }, [{
      type: "upsert_relation", value: { sourceNodeId: b!.id, targetNodeId: a!.id, type: "causes", description: "反向", orderException: false },
    }])).toThrow("关系规划超出指定范围");
  });
});

describe("prose backfill", () => {
  it("limits a volume scan to that volume's saved chapters", async () => {
    const model = { invokeText: async () => JSON.stringify({ events: [] }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const now = Date.now();
    book.database.handle.prepare("INSERT INTO volumes(id,book_id,title,summary,position,created_at,updated_at) VALUES(?,?,'第一卷','',1,?,?)")
      .run("volume-one", book.bookId, now, now);
    book.database.handle.prepare("INSERT INTO volumes(id,book_id,title,summary,position,created_at,updated_at) VALUES(?,?,'第二卷','',2,?,?)")
      .run("volume-two", book.bookId, now, now);
    book.database.handle.prepare("UPDATE chapters SET volume_id=? WHERE id=?").run("volume-one", book.chapterId);
    book.database.handle.prepare("INSERT INTO chapters(id,book_id,volume_id,title,status,position,created_at,updated_at) VALUES(?,?,?,'第二章','draft',1,?,?)")
      .run("chapter-two", book.bookId, "volume-two", now, now);
    book.database.handle.prepare(`INSERT INTO chapter_revisions(
      id,chapter_id,revision_number,parent_revision_id,document_hash,text_hash,extractor_version,character_count,origin,device_id,source_run_id,restored_from_revision_id,change_summary,created_at
    ) VALUES('revision-two','chapter-two',1,NULL,'doc-two','text-two',1,2,'editor','device',NULL,NULL,'保存',?)`).run(now);
    book.database.handle.prepare("INSERT INTO revision_documents(revision_id,document_schema_version,document_json,plain_text) VALUES('revision-two',1,'{}','正文')").run();
    book.database.handle.prepare("UPDATE chapters SET current_revision_id='revision-two' WHERE id='chapter-two'").run();
    const scan = await app.scanBackfill({ projectId: book.projectId, volumeId: "volume-one" });
    expect(scan.chapterInputs).toEqual([{ chapterId: book.chapterId, revisionId: book.revisionId }]);
  });

  it("extracts an event at the end of a long Unicode chapter with code-point offsets", async () => {
    const model = { invokeText: async (input: { prompt: string }) => JSON.stringify({ events: input.prompt.includes("尾部关键信息") ? [{
      title: "获得线索", summary: "发现线索", goal: "调查", conflict: "", outcome: "得到消息",
      excerpt: "尾部关键信息", matchedNodeId: null, uncertain: false,
      segmentIntent: "揭示消息", expectedLocalChange: "掌握线索", explanation: "结尾明确写出",
    }] : [] }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const revisionId = "long-chapter-revision";
    const text = `${"🧭".repeat(5_100)}尾部关键信息`;
    book.database.handle.prepare(`INSERT INTO chapter_revisions(
      id,chapter_id,revision_number,parent_revision_id,document_hash,text_hash,extractor_version,character_count,origin,device_id,source_run_id,restored_from_revision_id,change_summary,created_at
    ) VALUES(?,?,2,?,'long-doc','long-text',1,5106,'editor','device',NULL,NULL,'保存',?)`)
      .run(revisionId, book.chapterId, book.revisionId, Date.now());
    book.database.handle.prepare("INSERT INTO revision_documents(revision_id,document_schema_version,document_json,plain_text) VALUES(?,1,'{}',?)")
      .run(revisionId, text);
    book.database.handle.prepare("UPDATE chapters SET current_revision_id=?,row_version=row_version+1 WHERE id=?")
      .run(revisionId, book.chapterId);
    const scan = await app.scanBackfill({ projectId: book.projectId });
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]?.evidence[0]).toMatchObject({ startOffset: 5_100, endOffset: 5_106, excerpt: "尾部关键信息" });
  });

  it("accepts one cross-chapter event with two mapped excerpts and is idempotent", async () => {
    const model = { invokeText: async () => JSON.stringify({ events: [{
      title: "城门对质", summary: "主角得知真相", goal: "追问真相", conflict: "守门人隐瞒", outcome: "得知密信位置",
      excerpt: "正文", matchedNodeId: null, uncertain: false,
      segmentIntent: "推进对质", expectedLocalChange: "得到新线索", explanation: "正文直接写出对质",
    }] }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const text = "正文";
    const secondChapter = "chapter-two";
    const secondRevision = "revision-two";
    const now = Date.now();
    book.database.handle.prepare("INSERT INTO chapters(id,book_id,title,status,position,created_at,updated_at) VALUES(?,?,'第二章','draft',2,?,?)")
      .run(secondChapter, book.bookId, now, now);
    book.database.handle.prepare(`INSERT INTO chapter_revisions(
      id,chapter_id,revision_number,parent_revision_id,document_hash,text_hash,extractor_version,character_count,origin,device_id,source_run_id,restored_from_revision_id,change_summary,created_at
    ) VALUES(?,?,1,NULL,'doc2','text2',1,20,'editor','device',NULL,NULL,'保存',?)`).run(secondRevision, secondChapter, now);
    book.database.handle.prepare("INSERT INTO revision_documents(revision_id,document_schema_version,document_json,plain_text) VALUES(?,1,'{}',?)")
      .run(secondRevision, text);
    book.database.handle.prepare("UPDATE chapters SET current_revision_id=? WHERE id=?").run(secondRevision, secondChapter);

    const scan = await app.scanBackfill({ projectId: book.projectId });
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]?.mappingChanges).toHaveLength(2);
    expect(scan.candidates[0]?.evidence.map((item) => item.startOffset)).toEqual([0, 0]);
    const saved = app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [scan.candidates[0]!.candidateId] });
    expect(saved.nodes).toHaveLength(1);
    expect(saved.mappings).toHaveLength(2);
    expect(book.database.handle.prepare("SELECT COUNT(*) AS count FROM outline_backfill_evidence").get()).toEqual({ count: 2 });
    const again = app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [scan.candidates[0]!.candidateId] });
    expect(again.outline.revision).toBe(saved.outline.revision);
    const rescanned = await app.scanBackfill({ projectId: book.projectId });
    expect(rescanned.candidates[0]?.disposition).toBe("matched");
    expect(rescanned.candidates[0]?.patchOperations).toEqual([]);
    const evidence = app.getNodeBackfillEvidence(book.projectId, saved.nodes[0]!.id);
    expect(evidence).toHaveLength(2);
    expect(evidence.every((item) => !item.stale)).toBe(true);
    book.database.handle.prepare("UPDATE chapters SET current_revision_id=NULL WHERE id=?").run(book.chapterId);
    expect(app.getNodeBackfillEvidence(book.projectId, saved.nodes[0]!.id).filter((item) => item.stale)).toHaveLength(1);
  });

  it("keeps existing node facts unless the author explicitly accepts a suggested update", async () => {
    let matchedNodeId = "";
    const model = { invokeText: async () => JSON.stringify({ events: [{
      title: "城门对质", summary: "新证词", goal: "追问", conflict: "守门人拒绝", outcome: "得到密信",
      excerpt: "正文", matchedNodeId, uncertain: false,
      segmentIntent: "补充证词", expectedLocalChange: "主角获得线索", explanation: "正文有直接依据",
    }] }) } as unknown as ModelGateway;
    const { book, app, created } = active(model);
    matchedNodeId = app.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "event", value: eventNode({ title: "城门对质", outcome: "没有收获" }) }],
    } }).snapshot.nodes[0]!.id;

    const scan = await app.scanBackfill({ projectId: book.projectId });
    expect(scan.candidates[0]?.disposition).toBe("update-suggested");
    expect(scan.candidates[0]?.fieldDiff.some((diff) => diff.field === "outcome")).toBe(true);
    const preview = app.previewBackfillAcceptance({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [scan.candidates[0]!.candidateId] });
    expect(preview.operations).toEqual([]);
    expect(preview.mappingChanges).toHaveLength(1);
    expect(app.getOutlineSnapshot(book.projectId)?.outline.revision).toBe(2);
    const mapped = app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [scan.candidates[0]!.candidateId] });
    expect(mapped.nodes[0]?.outcome).toBe("没有收获");
    expect(mapped.mappings).toHaveLength(1);

    const second = await app.scanBackfill({ projectId: book.projectId });
    const candidateId = second.candidates[0]?.candidateId;
    if (!candidateId) throw new Error("candidate missing");
    expect(app.previewBackfillAcceptance({ projectId: book.projectId, scanId: second.scanId, candidateIds: [candidateId], applySuggestedUpdatesFor: [candidateId] }).operations.map((operation) => operation.type))
      .toEqual(["update_node"]);
    const updated = app.acceptBackfill({ projectId: book.projectId, scanId: second.scanId, candidateIds: [candidateId], applySuggestedUpdatesFor: [candidateId] });
    expect(updated.nodes[0]?.outcome).toBe("得到密信");
    expect(updated.mappings).toHaveLength(1);
  });

  it("adds an evidence-backed relation to an existing event during backfill", async () => {
    let targetNodeId = "";
    const model = { invokeText: async () => JSON.stringify({ events: [{
      title: "秘密揭露", summary: "出现新线索", goal: "调查", conflict: "", outcome: "知道真相",
      excerpt: "正文", matchedNodeId: null, uncertain: false,
      segmentIntent: "揭示线索", expectedLocalChange: "理解真相", explanation: "正文明确揭示",
      relations: [{ targetNodeId, type: "reveals", direction: "from", description: "先前调查使线索可解释", evidenceExcerpt: "正文" }],
    }] }) } as unknown as ModelGateway;
    const { book, app, created } = active(model);
    targetNodeId = app.applyOutlinePatch({ projectId: book.projectId, patch: {
      outlineId: created.outline.id, expectedRevision: 1,
      operations: [{ type: "create_node", tempId: "prior", value: eventNode({ title: "先前调查" }) }],
    } }).snapshot.nodes[0]!.id;
    const scan = await app.scanBackfill({ projectId: book.projectId });
    expect(scan.candidates[0]?.patchOperations.map((operation) => operation.type)).toEqual(["create_node", "upsert_relation"]);
    const saved = app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [scan.candidates[0]!.candidateId] });
    expect(saved.relations).toHaveLength(1);
    const newNode = saved.nodes.find((node) => node.id !== targetNodeId);
    expect(saved.relations[0]).toMatchObject({ sourceNodeId: targetNodeId, targetNodeId: newNode?.id, type: "reveals" });
    expect(app.getNodeBackfillEvidence(book.projectId, newNode!.id)).toHaveLength(1);
  });

  it("rejects a scan after the chapter revision changes without partial graph writes", async () => {
    const model = { invokeText: async () => JSON.stringify({ events: [{
      title: "正文事件", summary: "摘要", goal: "行动", conflict: "阻力", outcome: "结果", excerpt: "正文", matchedNodeId: null,
      uncertain: false, segmentIntent: "铺设", expectedLocalChange: "变化", explanation: "有原文",
    }] }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const scan = await app.scanBackfill({ projectId: book.projectId });
    book.database.handle.prepare("UPDATE chapters SET current_revision_id=NULL WHERE id=?").run(book.chapterId);
    expect(() => app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [scan.candidates[0]!.candidateId] }))
      .toThrow("正文基线已变化");
    expect(app.getOutlineSnapshot(book.projectId)?.nodes).toHaveLength(0);
  });

  it("requires an explicit author decision before accepting an uncertain event", async () => {
    const model = { invokeText: async () => JSON.stringify({ events: [{
      title: "传闻", summary: "人物听到传闻", goal: "求证", conflict: "来源不明", outcome: "", excerpt: "正文", matchedNodeId: null,
      uncertain: true, segmentIntent: "留下疑问", expectedLocalChange: "开始求证", explanation: "叙述者尚未证实",
    }] }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const scan = await app.scanBackfill({ projectId: book.projectId });
    const candidateId = scan.candidates[0]?.candidateId;
    if (!candidateId) throw new Error("candidate missing");
    expect(() => app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [candidateId] }))
      .toThrow("候选状态不允许接受");
    const saved = app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [candidateId], confirmedUncertainIds: [candidateId] });
    expect(saved.nodes[0]?.status).toBe("draft");
  });

  it("rolls back graph and mapping if evidence persistence fails", async () => {
    const model = { invokeText: async () => JSON.stringify({ events: [{
      title: "新事件", summary: "摘要", goal: "行动", conflict: "阻力", outcome: "结果", excerpt: "正文", matchedNodeId: null,
      uncertain: false, segmentIntent: "铺设", expectedLocalChange: "变化", explanation: "有原文",
    }] }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const scan = await app.scanBackfill({ projectId: book.projectId });
    book.database.handle.exec("CREATE TRIGGER reject_evidence BEFORE INSERT ON outline_backfill_evidence BEGIN SELECT RAISE(ABORT,'injected evidence failure'); END");
    const candidateId = scan.candidates[0]?.candidateId;
    if (!candidateId) throw new Error("candidate missing");
    expect(() => app.acceptBackfill({ projectId: book.projectId, scanId: scan.scanId, candidateIds: [candidateId] }))
      .toThrow("injected evidence failure");
    const snapshot = app.getOutlineSnapshot(book.projectId);
    expect(snapshot?.nodes).toHaveLength(0);
    expect(snapshot?.mappings).toHaveLength(0);
    expect(snapshot?.outline.revision).toBe(1);
    expect(app.getLatestBackfillScan(book.projectId)?.candidates[0]?.acceptedNodeId).toBeUndefined();
  });

  it("persists scan progress and stops an in-flight extraction", async () => {
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const model = { invokeText: async (input: { signal?: AbortSignal }) => new Promise<string>((_resolve, reject) => {
      started();
      input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }) } as unknown as ModelGateway;
    const { book, app } = active(model);
    const running = app.scanBackfill({ projectId: book.projectId });
    await entered;
    const pending = app.getLatestBackfillScan(book.projectId);
    expect(pending?.status).toBe("scanning");
    expect(pending?.chapterInputs).toEqual([{ chapterId: book.chapterId, revisionId: book.revisionId }]);
    if (!pending) throw new Error("scan missing");
    app.cancelBackfillScan({ projectId: book.projectId, scanId: pending.scanId });
    const stopped = await running;
    expect(stopped.status).toBe("cancelled");
    expect(app.getLatestBackfillScan(book.projectId)?.status).toBe("cancelled");
    expect(app.getOutlineSnapshot(book.projectId)?.nodes).toHaveLength(0);
  });
});
