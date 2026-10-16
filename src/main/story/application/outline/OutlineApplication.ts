import { createHash } from "node:crypto";
import type { ModelGateway } from "../../../agent/model/ModelGateway.ts";
import {
  OUTLINE_LIMITS,
  outlineTextLength,
  rejectOutlineBookId,
  type ApplyOutlinePatchRequest,
  type AcceptBackfillRequest,
  type BackfillAcceptancePreview,
  type BackfillScan,
  type CancelBackfillRequest,
  type CancelGraphWritingRequest,
  type BuildChapterContextRequest,
  type ChapterWritingResult,
  type CreateOutlineRequest,
  type EventGraphHandoff,
  type GraphWritingPlan,
  type GraphWritingStep,
  type NodeBackfillEvidence,
  type LoadHandoffRequest,
  type MapOutlineNodesRequest,
  type MarkNodesPendingRequest,
  type Outline,
  type OutlineChapterContext,
  type OutlineEvidence,
  type OutlineIssue,
  type OutlineNode,
  type OutlinePatchPreview,
  type OutlinePatchOperation,
  type OutlinePatchResult,
  type OutlineProposal,
  type OutlineSnapshot,
  type ProposeOutlineRequest,
  type PreviewGraphWritingRequest,
  type ReviewCoverageRequest,
  type RunOutlineChecksRequest,
  type ScanBackfillRequest,
  type StartChapterWritingRequest,
  type StartGraphWritingRequest,
  type UnmapOutlineNodeRequest,
  type UpdateOutlineNodeRequest,
  type UpdateOutlineProfileRequest,
  type WaiveMainlineRequest,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import type ChapterGenerationService from "../books/ChapterGenerationService.ts";
import type SqliteOutlineStore from "../../storage/book/SqliteOutlineStore.ts";
import {
  WAIVED_MAINLINE_INSTRUCTION,
  buildChapterInstruction,
  chosenChapterLeaves,
} from "./OutlineContextBuilder.ts";
import { assertNoBlockingIssues, collectOutlineIssues, isLeaf } from "./outlineChecks.ts";
import {
  OutlineContextTooLarge,
  OutlineModelError,
  OutlineNotFound,
  OutlineRepairableError,
  OutlineRevisionConflict,
  OutlineValidationError,
} from "./outlineErrors.ts";
import { readProposalOperations, renderOutlineProposalPrompt } from "./outlinePropose.ts";
import { simulateOutlinePatch } from "./outlinePatch.ts";
import { assertPlanningScope } from "./outlinePlanningScope.ts";
import { BACKFILL_EXTRACTOR_VERSION, backfillChunks, backfillPrompt, extractedCandidate, mergeBackfillCandidates, readBackfillEvents } from "./outlineBackfill.ts";
import {
  readCoverageIssues,
  readSemanticIssues,
  renderCoveragePrompt,
  renderSemanticPrompt,
} from "./outlineReview.ts";
import { outlineProposePrompt } from "../../resources/prompts/outlinePropose.prompt.ts";
import { outlineReviewCoveragePrompt, outlineReviewSemanticPrompt } from "../../resources/prompts/outlineReview.prompt.ts";

export type OutlineApplicationDependencies = {
  readonly model: ModelGateway | null;
  readonly eventGraphSkill?: string;
  readonly chapterGeneration?: ChapterGenerationService | null;
  readonly retrieveEvidence?: (
    bookId: string,
    chapterId: string,
    query: string,
  ) => Promise<readonly OutlineEvidence[]>;
};

export default class OutlineApplication {
  private static readonly activeBackfillScans = new Map<string, { readonly bookId: string; readonly controller: AbortController }>();
  private static readonly activeGraphWrites = new Map<string, { readonly controller: AbortController; readonly chapterIds: ReadonlySet<string> }>();
  constructor(
    private readonly store: SqliteOutlineStore,
    private readonly dependencies: OutlineApplicationDependencies,
  ) {}

  getOutlineSnapshot(projectId: string): OutlineSnapshot | null {
    this.guard({ projectId });
    return this.store.readActive();
  }

  createOutline(request: CreateOutlineRequest): OutlineSnapshot {
    const novelId = this.guard(request);
    const now = this.now();
    const outline: Outline = {
      id: this.allocateId("outline"),
      novelId,
      title: bounded(request.title, OUTLINE_LIMITS.title, "标题", false),
      premise: bounded(request.premise, OUTLINE_LIMITS.premise, "前提", true),
      theme: bounded(request.theme, OUTLINE_LIMITS.theme, "主题", true),
      coreConflict: bounded(request.coreConflict, OUTLINE_LIMITS.coreConflict, "核心冲突", true),
      climaxSummary: bounded(request.climaxSummary, OUTLINE_LIMITS.climaxSummary, "高潮", true),
      endingIntent: bounded(request.endingIntent, OUTLINE_LIMITS.endingIntent, "结局", true),
      status: "active",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const root = request.rootTitle
      ? this.draftNode(outline.id, bounded(request.rootTitle, OUTLINE_LIMITS.nodeTitle, "标题", false), now)
      : null;
    return this.store.createOutline(outline, root);
  }

  updateOutlineProfile(request: UpdateOutlineProfileRequest): OutlineSnapshot {
    this.guard(request);
    const current = this.requireSnapshot();
    if (current.outline.revision !== request.expectedRevision) {
      throw new OutlineRevisionConflict(current.outline.revision);
    }
    return this.store.updateProfile(
      {
        ...current.outline,
        title: bounded(request.title, OUTLINE_LIMITS.title, "标题", false),
        premise: bounded(request.premise, OUTLINE_LIMITS.premise, "前提", true),
        theme: bounded(request.theme, OUTLINE_LIMITS.theme, "主题", true),
        coreConflict: bounded(request.coreConflict, OUTLINE_LIMITS.coreConflict, "核心冲突", true),
        climaxSummary: bounded(request.climaxSummary, OUTLINE_LIMITS.climaxSummary, "高潮", true),
        endingIntent: bounded(request.endingIntent, OUTLINE_LIMITS.endingIntent, "结局", true),
        updatedAt: this.now(),
      },
      request.expectedRevision,
    );
  }

  updateOutlineNode(request: UpdateOutlineNodeRequest): OutlinePatchResult {
    this.guard(request);
    const snapshot = this.requireSnapshot();
    if (request.changes.status === "covered" || request.changes.status === "needs_revision") {
      if (Object.keys(request.changes).length !== 1) throw new OutlineValidationError("覆盖确认只能修改状态");
      this.requireRevision(snapshot, request.expectedRevision);
      const verification = request.coverageVerification;
      if (!verification) throw new OutlineValidationError("确认覆盖缺少章节修订");
      const chapter = this.store.requireOpenChapter(this.store.requireBookId(), verification.chapterId);
      const mapping = snapshot.mappings.find((item) => item.nodeId === request.nodeId && item.chapterId === chapter.id);
      const node = snapshot.nodes.find((item) => item.id === request.nodeId);
      if (!mapping || !node || node.status !== "writing" || !isLeaf(snapshot, node.id) ||
        mapping.coverageStatus !== "drafted" ||
        chapter.currentRevisionId !== verification.chapterRevisionId ||
        mapping.verificationOutlineRevision !== snapshot.outline.revision ||
        mapping.verificationChapterRevisionId !== verification.chapterRevisionId) {
        throw new OutlineValidationError("覆盖所依据的大纲或章节修订已不是当前修订");
      }
      const nextRevision = snapshot.outline.revision + 1;
      const coverageStatus = request.changes.status === "covered" ? "verified" as const : "deviated" as const;
      const mappings = snapshot.mappings.map((item) => item.nodeId === node.id && item.chapterId === chapter.id
        ? { ...item, coverageStatus, coverageNote: coverageStatus === "verified" ? "作者确认本章已写到" : "作者确认本章偏离规划", verificationOutlineRevision: nextRevision }
        : item.verificationOutlineRevision === snapshot.outline.revision
          ? { ...item, verificationOutlineRevision: nextRevision }
          : item);
      const related = mappings.filter((item) => item.nodeId === node.id);
      const fullyCovered = node.outcome.trim() !== "" && related.length > 0 && related.every((item) =>
        item.coverageStatus === "verified" && item.verificationOutlineRevision === nextRevision &&
        item.verificationChapterRevisionId === this.store.chapterRevisionIds(snapshot.outline.novelId).get(item.chapterId),
      );
      const status = coverageStatus === "deviated" ? "needs_revision" : fullyCovered ? "covered" : "writing";
      const next = this.mergeIssues({
        ...snapshot,
        outline: { ...snapshot.outline, revision: nextRevision, updatedAt: this.now() },
        nodes: snapshot.nodes.map((item) => item.id === node.id
          ? { ...item, status, revision: item.revision + 1, updatedAt: this.now() }
          : item),
        mappings,
      });
      return { snapshot: this.store.commit(next, request.expectedRevision), affectedNodeIds: [node.id] };
    }
    return this.applyOutlinePatch({
      projectId: request.projectId,
      patch: {
        outlineId: snapshot.outline.id,
        expectedRevision: request.expectedRevision,
        operations: [{ type: "update_node", nodeId: request.nodeId, changes: request.changes }],
      },
    });
  }

  previewOutlinePatch(request: ApplyOutlinePatchRequest): OutlinePatchPreview {
    this.guard(request);
    if (request.scope) assertPlanningScope(this.requireSnapshot(), request.scope, request.patch.operations);
    return this.simulate(request).preview;
  }

  applyOutlinePatch(request: ApplyOutlinePatchRequest): OutlinePatchResult {
    this.guard(request);
    if (request.scope) assertPlanningScope(this.requireSnapshot(), request.scope, request.patch.operations);
    if (request.patch.operations.some((operation) => operation.type === "update_node" &&
      (operation.changes.status === "writing" || operation.changes.status === "covered" ||
        operation.changes.status === "needs_revision"))) {
      throw new OutlineValidationError("写作覆盖状态只能通过章节核验更新");
    }
    const simulated = this.simulate(request);
    const next = this.mergeIssues(simulated.snapshot);
    return {
      snapshot: this.store.commit(next, request.patch.expectedRevision),
      affectedNodeIds: simulated.affectedNodeIds,
    };
  }

  mapOutlineNodes(request: MapOutlineNodesRequest): OutlineSnapshot {
    this.guard(request);
    const snapshot = this.requireSnapshot();
    this.requireRevision(snapshot, request.expectedRevision);
    const bookId = this.store.requireBookId();
    this.store.requireOpenChapter(bookId, request.chapterId);
    if (request.mappings.length === 0 || request.mappings.length > OUTLINE_LIMITS.operations) {
      throw new OutlineValidationError("映射数量非法");
    }
    const seen = new Set<string>();
    let sortOrder = snapshot.mappings
      .filter((mapping) => mapping.chapterId === request.chapterId)
      .reduce((max, mapping) => Math.max(max, mapping.sortOrder), 0);
    const mappings = [...snapshot.mappings];
    let changed = false;
    for (const input of request.mappings) {
      const nodeId = input.nodeId;
      if (seen.has(nodeId)) throw new OutlineValidationError("叶子重复映射");
      seen.add(nodeId);
      const node = snapshot.nodes.find((item) => item.id === nodeId);
        if (!node || (node.status !== "confirmed" && node.status !== "writing" && node.status !== "covered") || !isLeaf(snapshot, node.id)) {
        throw new OutlineValidationError("只能映射已确认叶子");
      }
      const segmentIntent = bounded(input.segmentIntent, OUTLINE_LIMITS.mappingIntent, "本章片段", false);
      const expectedLocalChange = bounded(input.expectedLocalChange, OUTLINE_LIMITS.mappingChange, "本章变化", false);
      if (input.sortOrder !== undefined && (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)) {
        throw new OutlineValidationError("章内顺序非法");
      }
      const existingIndex = mappings.findIndex((mapping) => mapping.nodeId === nodeId && mapping.chapterId === request.chapterId);
      const existing = mappings[existingIndex];
      if (existing) {
        const nextOrder = input.sortOrder ?? existing.sortOrder;
        if (existing.segmentIntent === segmentIntent && existing.expectedLocalChange === expectedLocalChange &&
          existing.sortOrder === nextOrder) continue;
        mappings[existingIndex] = {
          ...existing,
          sortOrder: nextOrder,
          segmentIntent,
          expectedLocalChange,
          coverageStatus: "planned",
          coverageNote: "",
          verificationOutlineRevision: null,
          verificationChapterRevisionId: null,
        };
        changed = true;
        continue;
      }
      sortOrder = input.sortOrder ?? sortOrder + 1000;
      mappings.push({
        chapterId: request.chapterId,
        nodeId,
        sortOrder,
        segmentIntent,
        expectedLocalChange,
        coverageStatus: "planned",
        coverageNote: "",
        verificationOutlineRevision: null,
        verificationChapterRevisionId: null,
      });
      changed = true;
    }
    if (!changed) return snapshot;
      const changedNodeIds = new Set(request.mappings.map((item) => item.nodeId));
    const next = this.mergeIssues({
      ...snapshot,
      outline: { ...snapshot.outline, revision: snapshot.outline.revision + 1, updatedAt: this.now() },
        nodes: snapshot.nodes.map((node) => changedNodeIds.has(node.id) && node.status === "covered"
          ? { ...node, status: "writing" as const, revision: node.revision + 1, updatedAt: this.now() }
          : node),
      mappings,
    });
    return this.store.commit(next, request.expectedRevision);
  }

  unmapOutlineNode(request: UnmapOutlineNodeRequest): OutlineSnapshot {
    this.guard(request);
    const snapshot = this.requireSnapshot();
    this.requireRevision(snapshot, request.expectedRevision);
    this.store.requireOpenChapter(this.store.requireBookId(), request.chapterId);
    if (!snapshot.mappings.some((mapping) => mapping.nodeId === request.nodeId && mapping.chapterId === request.chapterId)) {
      throw new OutlineValidationError("引用不存在");
    }
    const next = this.mergeIssues({
      ...snapshot,
      outline: { ...snapshot.outline, revision: snapshot.outline.revision + 1, updatedAt: this.now() },
      mappings: snapshot.mappings.filter((mapping) => mapping.nodeId !== request.nodeId || mapping.chapterId !== request.chapterId),
    });
    return this.store.commit(next, request.expectedRevision);
  }

  async proposeOutline(request: ProposeOutlineRequest): Promise<OutlineProposal> {
    this.guard(request);
    const snapshot = this.store.readActive();
    if (request.expectedOutlineRevision !== undefined && snapshot?.outline.revision !== request.expectedOutlineRevision) {
      throw new OutlineRevisionConflict(snapshot?.outline.revision ?? 0);
    }
    const instruction = request.instruction?.trim() ?? "";
    if (outlineTextLength(instruction) > OUTLINE_LIMITS.instruction) {
      throw new OutlineValidationError("要求超过上限");
    }
    const focusNodeIds = request.focusNodeIds ?? [];
    if (focusNodeIds.length > OUTLINE_LIMITS.operations) {
      throw new OutlineValidationError("点名节点过多");
    }
    for (const nodeId of focusNodeIds) {
      if (!snapshot?.nodes.some((node) => node.id === nodeId)) {
        throw new OutlineValidationError("引用不存在");
      }
    }
    const prompt = renderOutlineProposalPrompt(
      snapshot,
      request.parentNodeId,
      request.planningMode,
      instruction,
      focusNodeIds,
      request.scope,
    );
    const text = await this.invoke(prompt, this.eventGraphPrompt(outlineProposePrompt));
    const parsed = readProposalOperations(text);
    if ("problems" in parsed) return { status: "repairable", problems: parsed.problems };
    const patch = {
      outlineId: snapshot?.outline.id ?? "",
      expectedRevision: snapshot?.outline.revision ?? 0,
      operations: parsed.operations,
    };
    if (!snapshot) return { status: "draft", patch, summary: parsed.summary };
    try {
      if (request.scope) assertPlanningScope(snapshot, request.scope, patch.operations);
      simulateOutlinePatch(
        snapshot,
        patch,
        (prefix) => this.allocateId(prefix),
        this.store.foreignNodeIds(snapshot.outline.id),
      );
    } catch (error) {
      if (error instanceof OutlineRepairableError) {
        return { status: "repairable", problems: error.problems };
      }
      if (error instanceof OutlineValidationError) {
        return { status: "repairable", problems: [{ tempId: null, message: error.message }] };
      }
      throw error;
    }
    return { status: "draft", patch, summary: parsed.summary, ...(request.scope ? { scope: request.scope } : {}) };
  }

  getLatestBackfillScan(projectId: string): BackfillScan | null {
    this.guard({ projectId });
    const scan = this.store.latestBackfillScan();
    if (!scan) return null;
    const revision = this.store.readActive()?.outline.revision;
    const chapters = this.store.chapterRevisionIds(this.store.requireBookId());
    const stale = revision !== scan.outlineRevision || scan.chapterInputs.some((input) => chapters.get(input.chapterId) !== input.revisionId);
    return { ...scan, projectId, status: stale ? "stale" : scan.status === "scanning" && !OutlineApplication.activeBackfillScans.has(scan.scanId) ? "failed" : scan.status };
  }

  cancelBackfillScan(request: CancelBackfillRequest): BackfillScan {
    const bookId = this.guard(request);
    const scan = this.store.readBackfillScan(request.scanId);
    if (!scan) throw new OutlineValidationError("扫描结果不存在");
    const active = OutlineApplication.activeBackfillScans.get(request.scanId);
    if (active?.bookId === bookId) active.controller.abort();
    return { ...scan, projectId: request.projectId };
  }

  getNodeBackfillEvidence(projectId: string, nodeId: string): readonly NodeBackfillEvidence[] {
    const bookId = this.guard({ projectId });
    const snapshot = this.requireSnapshot();
    if (!snapshot.nodes.some((node) => node.id === nodeId)) throw new OutlineValidationError("事件节点不存在");
    const revisions = this.store.chapterRevisionIds(bookId);
    return this.store.listBackfillEvidence(snapshot.outline.id, nodeId).map((evidence) => ({
      ...evidence, stale: revisions.get(evidence.chapterId) !== evidence.revisionId,
    }));
  }

  async scanBackfill(request: ScanBackfillRequest): Promise<BackfillScan> {
    const bookId = this.guard(request);
    const snapshot = this.requireSnapshot();
    if (request.volumeId && request.chapterIds) throw new OutlineValidationError("不能同时选择卷和章节扫描");
    const requested = request.chapterIds ? new Set(request.chapterIds) : null;
    if ([...OutlineApplication.activeBackfillScans.values()].some((active) => active.bookId === bookId)) {
      throw new OutlineValidationError("这本书已有正文扫描在运行");
    }
    const inputs = this.store.listBackfillChapterInputs(bookId).filter((chapter) =>
      chapter.revisionId && (!requested || requested.has(chapter.id)) && (!request.volumeId || chapter.volumeId === request.volumeId));
    if (requested && (requested.size !== request.chapterIds?.length || requested.size !== inputs.length)) {
      throw new OutlineValidationError("扫描章节必须属于当前书且有正式正文");
    }
    if (request.volumeId && inputs.length === 0) throw new OutlineValidationError("本卷没有已保存的正式正文");
    const controller = new AbortController();
    let scan: BackfillScan = {
      scanId: `backfill_${crypto.randomUUID()}`,
      projectId: request.projectId,
      outlineRevision: snapshot.outline.revision,
      extractorVersion: BACKFILL_EXTRACTOR_VERSION,
      chapterInputs: inputs.map((input) => ({ chapterId: input.id, revisionId: input.revisionId ?? "" })),
      completedChapterIds: [],
      candidates: [],
      status: "scanning",
    };
    this.store.saveBackfillScan(scan);
    OutlineApplication.activeBackfillScans.set(scan.scanId, { bookId, controller });
    try {
      const candidates = [];
      for (const input of inputs) {
        if (controller.signal.aborted) break;
        const chapter = this.store.readBackfillChapter(bookId, input.id);
        if (!chapter.currentRevisionId || chapter.plainText.trim() === "") {
          if (requested) throw new OutlineValidationError("所选章节没有正式正文");
          scan = { ...scan, completedChapterIds: [...scan.completedChapterIds, chapter.id] };
          this.store.saveBackfillScan(scan);
          continue;
        }
        for (const chunk of backfillChunks(chapter.plainText)) {
          if (controller.signal.aborted) break;
          const text = await this.invoke(backfillPrompt(snapshot, chapter, chunk.text),
            this.eventGraphPrompt("你是事件图规划 Agent。依据正文证据识别事件，只返回 JSON。不得修改正文或正式图。"), controller.signal);
          for (const event of readBackfillEvents(text)) {
            const candidate = extractedCandidate(snapshot, chapter, chunk.start, chunk.text, event);
            if (candidate) candidates.push(candidate);
          }
        }
        if (controller.signal.aborted) break;
        scan = { ...scan, completedChapterIds: [...scan.completedChapterIds, chapter.id], candidates: mergeBackfillCandidates(candidates) };
        this.store.saveBackfillScan(scan);
      }
      const latest = this.requireSnapshot();
      const revisions = this.store.chapterRevisionIds(bookId);
      const stale = latest.outline.revision !== snapshot.outline.revision || scan.chapterInputs.some((input) => revisions.get(input.chapterId) !== input.revisionId);
      scan = { ...scan, candidates: mergeBackfillCandidates(candidates), status: controller.signal.aborted ? "cancelled" : stale ? "stale" : "ready" };
      this.store.saveBackfillScan(scan);
      return scan;
    } catch (error) {
      scan = { ...scan, status: controller.signal.aborted ? "cancelled" : "failed" };
      this.store.saveBackfillScan(scan);
      if (controller.signal.aborted) return scan;
      throw error;
    } finally {
      OutlineApplication.activeBackfillScans.delete(scan.scanId);
    }
  }

  previewBackfillAcceptance(request: AcceptBackfillRequest): BackfillAcceptancePreview {
    const bookId = this.guard(request);
    const candidateIds = new Set(request.candidateIds);
    const confirmedUncertain = new Set(request.confirmedUncertainIds ?? []);
    const applyUpdates = new Set(request.applySuggestedUpdatesFor ?? []);
    if (candidateIds.size === 0 || candidateIds.size !== request.candidateIds.length ||
      confirmedUncertain.size !== (request.confirmedUncertainIds?.length ?? 0) ||
      applyUpdates.size !== (request.applySuggestedUpdatesFor?.length ?? 0) ||
      [...confirmedUncertain, ...applyUpdates].some((id) => !candidateIds.has(id))) {
      throw new OutlineValidationError("候选预览范围非法");
    }
    const scan = this.store.readBackfillScan(request.scanId);
    if (!scan || scan.status !== "ready") throw new OutlineValidationError("扫描未完成或已过期，请重新扫描");
    const snapshot = this.requireSnapshot();
    this.requireRevision(snapshot, scan.outlineRevision);
    const selected = request.candidateIds.map((id) => scan.candidates.find((candidate) => candidate.candidateId === id));
    if (selected.some((candidate) => !candidate || candidate.acceptedNodeId ||
      candidate.disposition === "uncertain" && !confirmedUncertain.has(candidate.candidateId) ||
      applyUpdates.has(candidate.candidateId) && candidate.disposition !== "update-suggested")) {
      throw new OutlineValidationError("候选状态不允许预览");
    }
    const candidates = selected.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined);
    const chapters = new Map(scan.chapterInputs.map((input) => [input.chapterId, this.store.readBackfillChapter(bookId, input.chapterId)] as const));
    if (scan.chapterInputs.some((input) => chapters.get(input.chapterId)?.currentRevisionId !== input.revisionId)) {
      throw new OutlineValidationError("正文基线已变化，请重新扫描");
    }
    const evidence = candidates.flatMap((candidate) => candidate.evidence);
    for (const item of evidence) {
      const chapter = chapters.get(item.chapterId);
      if (!chapter || chapter.currentRevisionId !== item.revisionId ||
        Array.from(chapter.plainText).slice(item.startOffset, item.endOffset).join("") !== item.excerpt) {
        throw new OutlineValidationError("正文证据已过期或定位失败");
      }
    }
    const operations: OutlinePatchOperation[] = candidates.flatMap((candidate) => candidate.disposition === "update-suggested" && !applyUpdates.has(candidate.candidateId)
      ? candidate.patchOperations.filter((operation) => operation.type !== "update_node") : candidate.patchOperations);
    const simulated = operations.length ? simulateOutlinePatch(snapshot, {
      outlineId: snapshot.outline.id, expectedRevision: snapshot.outline.revision, operations,
    }, (prefix) => this.allocateId(prefix), this.store.foreignNodeIds(snapshot.outline.id)) : null;
    const mappingChanges = candidates.flatMap((candidate) => candidate.mappingChanges);
    for (const mapping of mappingChanges) {
      const resolved = simulated?.createdNodeIds.get(mapping.nodeRef) ?? mapping.nodeRef;
      if (!chapters.has(mapping.chapterId) || !(simulated?.snapshot ?? snapshot).nodes.some((node) => node.id === resolved)) {
        throw new OutlineValidationError("候选章节映射非法");
      }
    }
    return { scanId: scan.scanId, outlineRevision: snapshot.outline.revision,
      candidateIds: request.candidateIds, operations, mappingChanges, evidence };
  }

  acceptBackfill(request: AcceptBackfillRequest): OutlineSnapshot {
    this.guard(request);
    if (request.candidateIds.length === 0 || new Set(request.candidateIds).size !== request.candidateIds.length) {
      throw new OutlineValidationError("请选择待接受的候选");
    }
    const confirmedUncertain = new Set(request.confirmedUncertainIds ?? []);
    if (confirmedUncertain.size !== (request.confirmedUncertainIds?.length ?? 0) ||
      [...confirmedUncertain].some((id) => !request.candidateIds.includes(id))) {
      throw new OutlineValidationError("待判断候选的确认范围非法");
    }
    const applyUpdates = new Set(request.applySuggestedUpdatesFor ?? []);
    if (applyUpdates.size !== (request.applySuggestedUpdatesFor?.length ?? 0) ||
      [...applyUpdates].some((id) => !request.candidateIds.includes(id))) {
      throw new OutlineValidationError("节点事实更新范围非法");
    }
    return this.store.transaction(() => {
      const scan = this.store.readBackfillScan(request.scanId);
      if (!scan) throw new OutlineValidationError("扫描结果不存在");
      if (scan.status !== "ready") throw new OutlineValidationError("扫描未完成或已过期，请重新扫描");
      const chosen = request.candidateIds.map((id) => scan.candidates.find((candidate) => candidate.candidateId === id));
      if (chosen.some((candidate) => !candidate)) throw new OutlineValidationError("候选不存在");
      const selected = chosen.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined);
      if (selected.every((candidate) => candidate.acceptedNodeId)) return this.requireSnapshot();
      if (selected.some((candidate) => candidate.acceptedNodeId || candidate.disposition === "uncertain" && !confirmedUncertain.has(candidate.candidateId))) {
        throw new OutlineValidationError("候选状态不允许接受");
      }
      if (selected.some((candidate) => applyUpdates.has(candidate.candidateId) && candidate.disposition !== "update-suggested")) {
        throw new OutlineValidationError("节点事实更新范围非法");
      }
      const snapshot = this.requireSnapshot();
      this.requireRevision(snapshot, scan.outlineRevision);
      const chapters = new Map(scan.chapterInputs.map((input) => [
        input.chapterId, this.store.readBackfillChapter(snapshot.outline.novelId, input.chapterId),
      ] as const));
      for (const input of scan.chapterInputs) {
        if (chapters.get(input.chapterId)?.currentRevisionId !== input.revisionId) {
          throw new OutlineValidationError("正文基线已变化，请重新扫描");
        }
      }
      for (const candidate of selected) for (const evidence of candidate.evidence) {
        const chapter = chapters.get(evidence.chapterId);
        if (!chapter || chapter.currentRevisionId !== evidence.revisionId ||
          Array.from(chapter.plainText).slice(evidence.startOffset, evidence.endOffset).join("") !== evidence.excerpt) {
          throw new OutlineValidationError("正文证据已过期或定位失败");
        }
      }
      const operations = selected.flatMap((candidate) => candidate.disposition === "update-suggested" && !applyUpdates.has(candidate.candidateId)
        ? candidate.patchOperations.filter((operation) => operation.type !== "update_node") : candidate.patchOperations);
      const simulated = operations.length ? simulateOutlinePatch(snapshot, {
        outlineId: snapshot.outline.id, expectedRevision: snapshot.outline.revision, operations,
      }, (prefix) => this.allocateId(prefix), this.store.foreignNodeIds(snapshot.outline.id)) : null;
      const next = simulated?.snapshot ?? {
        ...snapshot,
        outline: { ...snapshot.outline, revision: snapshot.outline.revision + 1, updatedAt: this.now() },
      };
      const mappings = [...next.mappings];
      const accepted = selected.map((candidate) => {
        const created = candidate.patchOperations.find((operation) => operation.type === "create_node");
        const nodeId = candidate.matchedNodeId ?? (created && simulated?.createdNodeIds.get(created.tempId));
        if (!nodeId || !next.nodes.some((node) => node.id === nodeId)) throw new OutlineValidationError("候选节点引用失效");
        for (const mapping of candidate.mappingChanges) {
          const resolved: string = mapping.nodeRef === created?.tempId ? nodeId : mapping.nodeRef;
          if (resolved !== nodeId || !chapters.has(mapping.chapterId)) throw new OutlineValidationError("候选章节映射非法");
          if (mappings.some((item) => item.nodeId === nodeId && item.chapterId === mapping.chapterId)) continue;
          mappings.push({
            nodeId,
            chapterId: mapping.chapterId,
            sortOrder: mappings.filter((item) => item.chapterId === mapping.chapterId).length,
            segmentIntent: mapping.segmentIntent,
            expectedLocalChange: mapping.expectedLocalChange,
            coverageStatus: "drafted",
            coverageNote: "正文回填，待核验",
            verificationOutlineRevision: null,
            verificationChapterRevisionId: null,
          });
        }
        return { candidateId: candidate.candidateId, nodeId, evidence: candidate.evidence };
      });
      const saved = this.store.commit(this.mergeIssues({ ...next, mappings }), snapshot.outline.revision);
      this.store.recordBackfillAcceptance(scan.scanId, accepted, snapshot.outline.id);
      return saved;
    });
  }

  getLatestGraphWritingPlan(projectId: string): GraphWritingPlan | null {
    this.guard({ projectId });
    return this.store.latestGraphWritingPlan();
  }

  async previewGraphWritingPlan(request: PreviewGraphWritingRequest): Promise<GraphWritingPlan> {
    const bookId = this.guard(request);
    const snapshot = this.requireSnapshot();
    const root = snapshot.nodes.find((node) => node.id === request.scope.id);
    if (!root || (request.scope.kind === "stage" ? root.kind !== "arc" : root.kind !== "event")) {
      throw new OutlineValidationError("写作范围不是有效的阶段或事件");
    }
    const descendants = request.scope.kind === "node" ? [root] : snapshot.nodes.filter((node) => {
      let parentId = node.parentId;
      while (parentId) {
        if (parentId === root.id) return true;
        parentId = snapshot.nodes.find((item) => item.id === parentId)?.parentId ?? null;
      }
      return false;
    });
    const leaves = descendants.filter((node) => node.kind === "event" && isLeaf(snapshot, node.id));
    const skippedNodeIds = leaves.filter((node) => node.status !== "confirmed" && node.status !== "writing" && node.status !== "covered" ||
      !snapshot.mappings.some((mapping) => mapping.nodeId === node.id && mapping.segmentIntent.trim() && mapping.expectedLocalChange.trim())).map((node) => node.id);
    const eligible = new Set(leaves.filter((node) => !skippedNodeIds.includes(node.id)).map((node) => node.id));
    const chapterFilter = request.chapterIds ? new Set(request.chapterIds) : null;
    const rewrite = new Set(request.rewriteChapterIds ?? []);
    const chapters = this.store.listReadingChapters(bookId);
    const targets = chapters.filter((chapter) => (!chapterFilter || chapterFilter.has(chapter.id)) &&
      snapshot.mappings.some((mapping) => mapping.chapterId === chapter.id && eligible.has(mapping.nodeId)));
    if (chapterFilter && (chapterFilter.size !== request.chapterIds?.length || chapterFilter.size !== targets.length)) {
      throw new OutlineValidationError("所选章节没有可写的映射");
    }
    if ([...rewrite].some((id) => !targets.some((chapter) => chapter.id === id))) {
      throw new OutlineValidationError("改写章节不在本次计划中");
    }
    if (targets.length === 0 || targets.length > 20 || eligible.size > 100) {
      throw new OutlineValidationError("可写范围为空或超过单次计划上限（20 章、100 事件）");
    }
    const steps: GraphWritingStep[] = [];
    for (const chapter of targets) {
      const nodeIds = snapshot.mappings.filter((mapping) => mapping.chapterId === chapter.id && eligible.has(mapping.nodeId))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((mapping) => mapping.nodeId);
      const handoff = await this.buildChapterContext({ projectId: request.projectId, chapterId: chapter.id, selection: nodeIds });
      steps.push({
        stepId: `graph_step_${crypto.randomUUID()}`,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        nodeIds,
        mode: rewrite.has(chapter.id) ? "rewrite" : "append",
        expectedChapterRevisionId: chapter.currentRevisionId,
        expectedChapterRowVersion: chapter.rowVersion,
        handoffDigest: digest(handoff.instruction),
        instruction: handoff.instruction,
        state: "pending",
      });
    }
    const chapterInputs = chapters.map((chapter) => ({ chapterId: chapter.id, revisionId: chapter.currentRevisionId }));
    const plan: GraphWritingPlan = {
      planId: `graph_plan_${crypto.randomUUID()}`,
      projectId: request.projectId,
      scope: request.scope,
      outlineRevision: snapshot.outline.revision,
      status: "previewed",
      chapterInputs,
      steps,
      skippedNodeIds,
      previewDigest: digest(JSON.stringify({ scope: request.scope, outlineRevision: snapshot.outline.revision, chapterInputs, steps, skippedNodeIds })),
    };
    this.store.saveGraphWritingPlan(plan);
    return plan;
  }

  async startGraphWritingPlan(request: StartGraphWritingRequest): Promise<GraphWritingPlan> {
    this.guard(request);
    const saved = this.store.readGraphWritingPlan(request.planId);
    if (!saved || saved.projectId !== request.projectId || saved.previewDigest !== request.previewDigest) {
      throw new OutlineValidationError("写作计划不存在或预览已变化");
    }
    if (saved.status === "completed" || saved.status === "cancelled") return saved;
    if (OutlineApplication.activeGraphWrites.has(saved.planId)) throw new OutlineValidationError("写作计划正在运行");
    const chapterIds = new Set(saved.steps.filter((step) => step.state !== "saved").map((step) => step.chapterId));
    if ([...OutlineApplication.activeGraphWrites.values()].some((active) => [...chapterIds].some((id) => active.chapterIds.has(id)))) {
      throw new OutlineValidationError("目标章节已有写作任务在运行");
    }
    const controller = new AbortController();
    OutlineApplication.activeGraphWrites.set(saved.planId, { controller, chapterIds });
    let plan: GraphWritingPlan = { ...saved, status: "running" };
    this.store.saveGraphWritingPlan(plan);
    try {
      for (const original of plan.steps) {
        if (original.state === "saved") {
          if (original.errorCode !== "coverage_pending") continue;
          const snapshot = this.requireSnapshot();
          const chapter = this.store.requireOpenChapter(snapshot.outline.novelId, original.chapterId);
          if (snapshot.outline.revision !== plan.outlineRevision || !original.savedRevisionId ||
            chapter.currentRevisionId !== original.savedRevisionId) break;
          try {
            this.markNodesPendingVerification({
              projectId: request.projectId, expectedRevision: plan.outlineRevision,
              chapterId: original.chapterId, nodeIds: [...original.nodeIds], chapterRevisionId: original.savedRevisionId,
            });
            plan = {
              ...plan,
              outlineRevision: this.requireSnapshot().outline.revision,
              steps: plan.steps.map((step) => step.stepId === original.stepId ? { ...step, errorCode: undefined } : step),
            };
            this.store.saveGraphWritingPlan(plan);
          } catch {
            break;
          }
          continue;
        }
        if (controller.signal.aborted) break;
        try {
        const snapshot = this.requireSnapshot();
        const recovered = this.store.revisionBySourceRunId(original.stepId);
        const alreadyMarked = recovered !== null && snapshot.outline.revision === plan.outlineRevision + 1 &&
          original.nodeIds.every((nodeId) => snapshot.mappings.some((mapping) =>
            mapping.nodeId === nodeId && mapping.chapterId === original.chapterId &&
            mapping.coverageStatus === "drafted" && mapping.verificationChapterRevisionId === recovered.id &&
            mapping.verificationOutlineRevision === snapshot.outline.revision));
        if (snapshot.outline.revision !== plan.outlineRevision && !alreadyMarked && !recovered) {
          throw new OutlineValidationError("事件图已变化，请重新预览写作计划");
        }
        const chapters = this.store.listReadingChapters(snapshot.outline.novelId);
        const chapter = chapters.find((item) => item.id === original.chapterId);
        if (!chapter) throw new OutlineValidationError("目标章节已删除");
        if (!recovered) {
          if (chapter.currentRevisionId !== original.expectedChapterRevisionId || chapter.rowVersion !== original.expectedChapterRowVersion) {
            throw new OutlineValidationError("目标章节已被编辑，请重新预览");
          }
          for (const baseline of plan.chapterInputs) {
            if (chapters.find((item) => item.id === baseline.chapterId)?.currentRevisionId !== baseline.revisionId) {
              throw new OutlineValidationError("前文已被编辑，请重新预览");
            }
          }
        }
        plan = { ...plan, steps: plan.steps.map((step) => step.stepId === original.stepId ? { ...step, state: "running" } : step) };
        this.store.saveGraphWritingPlan(plan);
          let revisionId = recovered?.id;
          if (!revisionId) {
            const generation = this.dependencies.chapterGeneration;
            if (!generation) throw new OutlineValidationError("章节生成服务不可用");
            const context = await this.buildChapterContext({ projectId: request.projectId, chapterId: original.chapterId, selection: original.nodeIds });
            const result = await generation.generate({
              projectId: request.projectId,
              chapterId: original.chapterId,
              mode: original.mode,
              instruction: context.instruction,
              sourceRunId: original.stepId,
              signal: controller.signal,
            });
            revisionId = result.revisionId ?? this.store.revisionBySourceRunId(original.stepId)?.id;
          }
          if (!revisionId) throw new OutlineValidationError("正文保存结果缺少修订标识");
          const current = this.store.requireOpenChapter(snapshot.outline.novelId, original.chapterId);
          let errorCode: string | undefined;
          if (current.currentRevisionId === revisionId && alreadyMarked) {
            // A prior run saved the coverage change, then stopped before its plan checkpoint.
          } else if (current.currentRevisionId === revisionId && snapshot.outline.revision === plan.outlineRevision) {
            try {
              this.markNodesPendingVerification({
                projectId: request.projectId, expectedRevision: plan.outlineRevision,
                chapterId: original.chapterId, nodeIds: [...original.nodeIds], chapterRevisionId: revisionId,
              });
            } catch {
              errorCode = "coverage_pending";
            }
          } else if (current.currentRevisionId === revisionId) {
            errorCode = "coverage_pending";
          } else {
            errorCode = "chapter_changed_after_save";
          }
          plan = {
            ...plan,
            outlineRevision: this.requireSnapshot().outline.revision,
            chapterInputs: plan.chapterInputs.map((input) => input.chapterId === original.chapterId ? { ...input, revisionId } : input),
            steps: plan.steps.map((step) => step.stepId === original.stepId ? {
              ...step, state: "saved", savedRevisionId: revisionId, errorCode,
            } : step),
          };
          this.store.saveGraphWritingPlan(plan);
          if (errorCode) break;
        } catch (error) {
          plan = { ...plan, steps: plan.steps.map((step) => step.stepId === original.stepId ? {
            ...step, state: controller.signal.aborted ? "cancelled" : "failed",
            errorCode: error instanceof OutlineValidationError ? "stale_plan" : "generation_failed",
          } : step) };
          this.store.saveGraphWritingPlan(plan);
          break;
        }
      }
      const savedCount = plan.steps.filter((step) => step.state === "saved").length;
      plan = { ...plan, status: controller.signal.aborted ? "cancelled" : savedCount === plan.steps.length && plan.steps.every((step) => !step.errorCode)
        ? "completed" : savedCount > 0 ? "partial" : "failed" };
      this.store.saveGraphWritingPlan(plan);
      return plan;
    } finally {
      OutlineApplication.activeGraphWrites.delete(saved.planId);
    }
  }

  cancelGraphWritingPlan(request: CancelGraphWritingRequest): GraphWritingPlan {
    this.guard(request);
    const plan = this.store.readGraphWritingPlan(request.planId);
    if (!plan || plan.projectId !== request.projectId) throw new OutlineValidationError("写作计划不存在");
    OutlineApplication.activeGraphWrites.get(plan.planId)?.controller.abort();
    if (plan.status === "previewed") {
      const cancelled: GraphWritingPlan = { ...plan, status: "cancelled" };
      this.store.saveGraphWritingPlan(cancelled);
      return cancelled;
    }
    return plan;
  }

  async runOutlineChecks(request: RunOutlineChecksRequest): Promise<OutlineSnapshot> {
    this.guard(request);
    if (typeof request.includeSemantic !== "boolean") {
      throw new Error("includeSemantic is required.");
    }
    const snapshot = this.requireSnapshot();
    const rules = collectOutlineIssues(snapshot, this.checkContext(snapshot));
    const semantic = request.includeSemantic
      ? readSemanticIssues(
          await this.invoke(renderSemanticPrompt(snapshot), outlineReviewSemanticPrompt),
          snapshot,
          (prefix) => this.allocateId(prefix),
          "",
        )
      : [];
    return this.persistIssues(snapshot, [...rules, ...semantic]);
  }

  async buildChapterContext(request: BuildChapterContextRequest): Promise<OutlineChapterContext> {
    const bookId = this.guard(request);
    const snapshot = this.requireSnapshot();
    this.store.requireOpenChapter(bookId, request.chapterId);
    const chosen = chosenChapterLeaves(snapshot, request.chapterId, request.selection ?? []);
    const evidence = await this.loadEvidence(
      bookId,
      request.chapterId,
      chosen.map((node) => node.title).join(" "),
    );
    return buildChapterInstruction({
      snapshot,
      chapterId: request.chapterId,
      selection: request.selection ?? [],
      chapters: this.store.listReadingChapters(bookId),
      evidence,
    });
  }

  async loadEventGraphHandoff(request: LoadHandoffRequest): Promise<EventGraphHandoff> {
    const bookId = this.guard(request);
    const chapter = this.store.requireOpenChapter(bookId, request.chapterId);
    const snapshot = this.store.readActive();
    const revision = snapshot?.outline.revision ?? null;
    const waiver = this.store.readWaiver(chapter.id);
    if (waiver && waiver.waivedOutlineRevision === revision) {
      return {
        status: "waived",
        chapterId: chapter.id,
        chapterRevisionId: chapter.currentRevisionId,
        instruction: WAIVED_MAINLINE_INSTRUCTION,
        waivedAtOutlineRevision: revision,
      };
    }
    if (!snapshot) return { status: "missing", reason: "no-outline", chapterId: chapter.id };
    const chosen = chosenChapterLeaves(snapshot, chapter.id, request.selection ?? []);
    if (chosen.length === 0) return { status: "missing", reason: "no-accepted-leaf", chapterId: chapter.id };
    try {
      const context = buildChapterInstruction({
        snapshot,
        chapterId: chapter.id,
        selection: chosen.map((node) => node.id),
        chapters: this.store.listReadingChapters(bookId),
        evidence: await this.loadEvidence(
          bookId,
          chapter.id,
          chosen.map((node) => node.title).join(" "),
        ),
      });
      return {
        status: "ready",
        outlineRevision: snapshot.outline.revision,
        chapterId: chapter.id,
        chapterRevisionId: chapter.currentRevisionId,
        instruction: context.instruction,
        nodeIds: chosen.map((node) => node.id),
      };
    } catch (error) {
      if (error instanceof OutlineContextTooLarge) return { status: "too-large", chapterId: chapter.id };
      throw error;
    }
  }

  waiveChapterMainline(request: WaiveMainlineRequest): EventGraphHandoff {
    const bookId = this.guard(request);
    const chapter = this.store.requireOpenChapter(bookId, request.chapterId);
    const revision = this.store.readActive()?.outline.revision ?? null;
    this.store.writeWaiver(chapter.id, revision);
    return {
      status: "waived",
      chapterId: chapter.id,
      chapterRevisionId: chapter.currentRevisionId,
      instruction: WAIVED_MAINLINE_INSTRUCTION,
      waivedAtOutlineRevision: revision,
    };
  }

  markNodesPendingVerification(request: MarkNodesPendingRequest): OutlineSnapshot {
    this.guard(request);
    const snapshot = this.requireSnapshot();
    this.requireRevision(snapshot, request.expectedRevision);
    const chapter = this.store.requireOpenChapter(this.store.requireBookId(), request.chapterId);
    if (chapter.currentRevisionId !== request.chapterRevisionId) {
      throw new OutlineValidationError("覆盖所依据的章节修订已不是当前修订");
    }
    if (request.nodeIds.length === 0) throw new OutlineValidationError("引用不存在");
    const selected = new Set<string>();
    const now = this.now();
    const nextRevision = snapshot.outline.revision + 1;
    const nodes = snapshot.nodes.map((node) => {
      if (!request.nodeIds.includes(node.id)) return node;
      if (selected.has(node.id)) throw new OutlineValidationError("引用不存在");
      selected.add(node.id);
      const mapped = snapshot.mappings.some(
        (mapping) => mapping.nodeId === node.id && mapping.chapterId === chapter.id,
      );
      if (!mapped || (node.status !== "confirmed" && node.status !== "writing" && node.status !== "covered") || !isLeaf(snapshot, node.id)) {
        throw new OutlineValidationError("引用不存在");
      }
      return { ...node, status: "writing" as const, revision: node.revision + 1, updatedAt: now };
    });
    if (selected.size !== request.nodeIds.length) throw new OutlineValidationError("引用不存在");
    const mappings = snapshot.mappings.map((mapping) =>
      selected.has(mapping.nodeId) && mapping.chapterId === chapter.id
        ? {
            ...mapping,
            coverageStatus: "drafted" as const,
            coverageNote: "",
            verificationOutlineRevision: nextRevision,
            verificationChapterRevisionId: request.chapterRevisionId,
          }
        : mapping.verificationOutlineRevision === snapshot.outline.revision
          ? { ...mapping, verificationOutlineRevision: nextRevision }
          : mapping,
    );
    return this.store.commit({ ...snapshot, outline: { ...snapshot.outline, revision: nextRevision, updatedAt: now }, nodes, mappings }, request.expectedRevision);
  }

  async reviewChapterCoverage(request: ReviewCoverageRequest): Promise<OutlineSnapshot> {
    const bookId = this.guard(request);
    const snapshot = this.requireSnapshot();
    const chapter = this.store.requireOpenChapter(bookId, request.chapterId);
    const leaves = snapshot.nodes.filter(
      (node) =>
        isLeaf(snapshot, node.id) &&
        snapshot.mappings.some((mapping) => mapping.nodeId === node.id && mapping.chapterId === chapter.id),
    );
    const text = await this.invoke(
      renderCoveragePrompt(
        snapshot,
        chapter.plainText,
        leaves.map((node) => ({ id: node.id, title: node.title, goal: node.goal })),
      ),
      outlineReviewCoveragePrompt,
    );
    const issues = readCoverageIssues(
      text,
      snapshot,
      chapter.currentRevisionId ?? "",
      (prefix) => this.allocateId(prefix),
    );
    const saved = this.persistIssues(snapshot, issues);
    const unchanged = saved.nodes.every((node, index) => node.status === snapshot.nodes[index]?.status);
    if (!unchanged) throw new OutlineValidationError("覆盖检查不能修改节点状态");
    return saved;
  }

  async startChapterWriting(
    request: StartChapterWritingRequest,
    signal?: AbortSignal,
  ): Promise<ChapterWritingResult> {
    this.guard(request);
    if (request.mode !== "append" && request.mode !== "rewrite") {
      throw new OutlineValidationError("写作模式枚举非法");
    }
    if (request.decision !== undefined && request.decision !== "generate-events" && request.decision !== "continue") {
      throw new OutlineValidationError("写作选择枚举非法");
    }
    let handoff = await this.loadEventGraphHandoff(request);
    if (request.expectedHandoff) {
      const expected = request.expectedHandoff;
      const actualNodeIds = handoff.status === "ready" ? handoff.nodeIds : [];
      const matches = expected.chapterId === handoff.chapterId && expected.status === handoff.status && (
        (expected.status === "ready" && handoff.status === "ready" &&
          expected.outlineRevision === handoff.outlineRevision &&
          expected.chapterRevisionId === handoff.chapterRevisionId &&
          expected.instruction === handoff.instruction &&
          expected.nodeIds.length === actualNodeIds.length &&
          expected.nodeIds.every((id, index) => id === actualNodeIds[index])) ||
        (expected.status === "waived" && handoff.status === "waived" &&
          expected.waivedAtOutlineRevision === handoff.waivedAtOutlineRevision &&
          expected.chapterRevisionId === handoff.chapterRevisionId &&
          expected.instruction === handoff.instruction)
      );
      if (!matches) throw new OutlineValidationError("写作指导已变化，请重新预览");
    }
    if (handoff.status === "missing" && request.decision === "continue") {
      this.waiveChapterMainline(request);
      handoff = await this.loadEventGraphHandoff(request);
    }
    if (handoff.status === "missing" && request.decision === "generate-events") {
      const proposal = await this.proposeOutline({
        projectId: request.projectId,
        planningMode: "sequential",
        parentNodeId: null,
      });
      return { status: "event-graph", chapterId: request.chapterId, proposal };
    }
    if (handoff.status === "missing") {
      return { status: "choice", reason: handoff.reason, chapterId: handoff.chapterId };
    }
    if (handoff.status === "too-large") return { status: "too-large", chapterId: handoff.chapterId };
    const generation = this.dependencies.chapterGeneration;
    if (!generation) throw new Error("Chapter generation is unavailable.");
    const result = await generation.generate({
      projectId: request.projectId,
      chapterId: request.chapterId,
      mode: request.mode,
      instruction: handoff.instruction,
      signal,
    });
    if (handoff.status === "ready") {
      const chapter = this.store.requireOpenChapter(this.store.requireBookId(), request.chapterId);
      if (!chapter.currentRevisionId) throw new OutlineValidationError("引用不存在");
      this.markNodesPendingVerification({
        projectId: request.projectId,
        expectedRevision: handoff.outlineRevision,
        chapterId: request.chapterId,
        nodeIds: [...handoff.nodeIds],
        chapterRevisionId: chapter.currentRevisionId,
      });
    }
    return { status: "written", handoff, result };
  }

  private simulate(request: ApplyOutlinePatchRequest) {
    const snapshot = this.requireSnapshot();
    return simulateOutlinePatch(
      snapshot,
      request.patch,
      (prefix) => this.allocateId(prefix),
      this.store.foreignNodeIds(snapshot.outline.id),
    );
  }

  private mergeIssues(snapshot: OutlineSnapshot): OutlineSnapshot {
    const found = collectOutlineIssues(snapshot, this.checkContext(snapshot));
    assertNoBlockingIssues(found);
    return this.appendIssues(snapshot, found);
  }

  private persistIssues(snapshot: OutlineSnapshot, issues: readonly OutlineIssue[]): OutlineSnapshot {
    return this.store.commit(this.appendIssues(snapshot, issues), snapshot.outline.revision);
  }

  private appendIssues(snapshot: OutlineSnapshot, issues: readonly OutlineIssue[]): OutlineSnapshot {
    const seen = new Set(snapshot.issues.map((issue) => issue.fingerprint));
    const appended = issues.filter((issue) => {
      if (seen.has(issue.fingerprint)) return false;
      seen.add(issue.fingerprint);
      return true;
    });
    return { ...snapshot, issues: [...snapshot.issues, ...appended] };
  }

  private checkContext(snapshot: OutlineSnapshot) {
    return {
      foreignNodeIds: this.store.foreignNodeIds(snapshot.outline.id),
      chapterRevisionIds: this.store.chapterRevisionIds(snapshot.outline.novelId),
      allocateId: (prefix: string) => this.allocateId(prefix),
    };
  }

  private async loadEvidence(
    bookId: string,
    chapterId: string,
    query: string,
  ): Promise<readonly OutlineEvidence[]> {
    if (!this.dependencies.retrieveEvidence || query.trim() === "") return [];
    return this.dependencies.retrieveEvidence(bookId, chapterId, query);
  }

  private async invoke(prompt: string, systemPrompt: string, signal?: AbortSignal): Promise<string> {
    const invokeText = this.dependencies.model?.invokeText;
    if (!invokeText) throw new OutlineModelError("Model text invocation is unavailable.");
    return invokeText.call(this.dependencies.model, {
      prompt,
      threadId: `outline_${crypto.randomUUID()}`,
      systemPrompt,
      tools: [],
      maxTurns: 1,
      visibility: "internal",
      signal,
    });
  }

  private eventGraphPrompt(base: string): string {
    return this.dependencies.eventGraphSkill ? `${base}\n\n# 事件图理论 Skill\n${this.dependencies.eventGraphSkill}` : base;
  }

  private requireSnapshot(): OutlineSnapshot {
    const snapshot = this.store.readActive();
    if (!snapshot) throw new OutlineNotFound();
    return snapshot;
  }

  private requireRevision(snapshot: OutlineSnapshot, expectedRevision: number): void {
    if (snapshot.outline.revision !== expectedRevision) {
      throw new OutlineRevisionConflict(snapshot.outline.revision);
    }
  }

  private guard(request: { readonly projectId?: string }): string {
    rejectOutlineBookId(request);
    if (typeof request.projectId !== "string" || request.projectId.trim() === "") {
      throw new Error("Project id is required.");
    }
    return this.store.requireBookId();
  }

  private draftNode(outlineId: string, title: string, now: string): OutlineNode {
    return {
      id: this.allocateId("node"),
      outlineId,
      parentId: null,
      kind: "arc",
      title,
      summary: "",
      structuralRole: "setup",
      narrativeFunction: "mixed",
      goal: "",
      conflict: "",
      outcome: "",
      locationText: "",
      timeText: "",
      storyOrder: 1000,
      narrativeOrder: 1000,
      status: "draft",
      notes: "",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  private allocateId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}

function bounded(value: unknown, max: number, label: string, allowEmpty: boolean): string {
  if (typeof value !== "string") throw new OutlineValidationError(`${label}必须是字符串`);
  if (!allowEmpty && value.trim() === "") throw new OutlineValidationError(`${label}不能为空`);
  if (outlineTextLength(value) > max) throw new OutlineValidationError(`${label}超过上限`);
  return value;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
