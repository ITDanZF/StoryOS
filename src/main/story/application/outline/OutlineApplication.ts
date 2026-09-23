import type { ModelGateway } from "../../../agent/model/ModelGateway.ts";
import {
  OUTLINE_LIMITS,
  outlineTextLength,
  rejectOutlineBookId,
  type ApplyOutlinePatchRequest,
  type BuildChapterContextRequest,
  type ChapterWritingResult,
  type CreateOutlineRequest,
  type EventGraphHandoff,
  type LoadHandoffRequest,
  type MapOutlineNodesRequest,
  type MarkNodesPendingRequest,
  type Outline,
  type OutlineChapterContext,
  type OutlineEvidence,
  type OutlineIssue,
  type OutlineNode,
  type OutlinePatchPreview,
  type OutlinePatchResult,
  type OutlineProposal,
  type OutlineSnapshot,
  type ProposeOutlineRequest,
  type ReviewCoverageRequest,
  type RunOutlineChecksRequest,
  type StartChapterWritingRequest,
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
  readonly chapterGeneration?: ChapterGenerationService | null;
  readonly retrieveEvidence?: (
    bookId: string,
    chapterId: string,
    query: string,
  ) => Promise<readonly OutlineEvidence[]>;
};

export default class OutlineApplication {
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
    return this.simulate(request).preview;
  }

  applyOutlinePatch(request: ApplyOutlinePatchRequest): OutlinePatchResult {
    this.guard(request);
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
    const seen = new Set<string>();
    let sortOrder = snapshot.mappings.reduce((max, mapping) => Math.max(max, mapping.sortOrder), 0);
    const mappings = [...snapshot.mappings];
    for (const nodeId of request.nodeIds) {
      if (seen.has(nodeId)) throw new OutlineValidationError("叶子重复映射");
      seen.add(nodeId);
      const node = snapshot.nodes.find((item) => item.id === nodeId);
      if (!node || !isLeaf(snapshot, node.id)) throw new OutlineValidationError("引用不存在");
      const existing = mappings.find((mapping) => mapping.nodeId === nodeId);
      if (existing && existing.chapterId !== request.chapterId) {
        throw new OutlineValidationError("叶子重复映射");
      }
      if (existing) continue;
      sortOrder += 1000;
      mappings.push({
        chapterId: request.chapterId,
        nodeId,
        sortOrder,
        coverageStatus: "planned",
        coverageNote: "",
        verificationOutlineRevision: null,
        verificationChapterRevisionId: null,
      });
    }
    const next = this.mergeIssues({
      ...snapshot,
      outline: { ...snapshot.outline, revision: snapshot.outline.revision + 1, updatedAt: this.now() },
      mappings,
    });
    return this.store.commit(next, request.expectedRevision);
  }

  unmapOutlineNode(request: UnmapOutlineNodeRequest): OutlineSnapshot {
    this.guard(request);
    const snapshot = this.requireSnapshot();
    this.requireRevision(snapshot, request.expectedRevision);
    if (!snapshot.mappings.some((mapping) => mapping.nodeId === request.nodeId)) {
      throw new OutlineValidationError("引用不存在");
    }
    const next = this.mergeIssues({
      ...snapshot,
      outline: { ...snapshot.outline, revision: snapshot.outline.revision + 1, updatedAt: this.now() },
      mappings: snapshot.mappings.filter((mapping) => mapping.nodeId !== request.nodeId),
    });
    return this.store.commit(next, request.expectedRevision);
  }

  async proposeOutline(request: ProposeOutlineRequest): Promise<OutlineProposal> {
    this.guard(request);
    const snapshot = this.store.readActive();
    const prompt = renderOutlineProposalPrompt(snapshot, request.parentNodeId, request.planningMode);
    const text = await this.invoke(prompt, outlineProposePrompt);
    const parsed = readProposalOperations(text);
    if ("problems" in parsed) return { status: "repairable", problems: parsed.problems };
    const patch = {
      outlineId: snapshot?.outline.id ?? "",
      expectedRevision: snapshot?.outline.revision ?? 0,
      operations: parsed.operations,
    };
    if (!snapshot) return { status: "draft", patch, summary: parsed.summary };
    try {
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
      throw error;
    }
    return { status: "draft", patch, summary: parsed.summary };
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
    const nodes = snapshot.nodes.map((node) => {
      if (!request.nodeIds.includes(node.id)) return node;
      if (selected.has(node.id)) throw new OutlineValidationError("引用不存在");
      selected.add(node.id);
      const mapped = snapshot.mappings.some(
        (mapping) => mapping.nodeId === node.id && mapping.chapterId === chapter.id,
      );
      if (!mapped || node.status !== "confirmed" || !isLeaf(snapshot, node.id)) {
        throw new OutlineValidationError("引用不存在");
      }
      return { ...node, status: "writing" as const, revision: node.revision + 1, updatedAt: now };
    });
    if (selected.size !== request.nodeIds.length) throw new OutlineValidationError("引用不存在");
    const mappings = snapshot.mappings.map((mapping) =>
      selected.has(mapping.nodeId) && mapping.chapterId === chapter.id
        ? {
            ...mapping,
            verificationOutlineRevision: snapshot.outline.revision,
            verificationChapterRevisionId: request.chapterRevisionId,
          }
        : mapping,
    );
    return this.store.commit({ ...snapshot, nodes, mappings }, request.expectedRevision);
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

  private async invoke(prompt: string, systemPrompt: string): Promise<string> {
    const invokeText = this.dependencies.model?.invokeText;
    if (!invokeText) throw new OutlineModelError("Model text invocation is unavailable.");
    return invokeText.call(this.dependencies.model, {
      prompt,
      threadId: `outline_${crypto.randomUUID()}`,
      systemPrompt,
      tools: [],
      maxTurns: 1,
      visibility: "internal",
    });
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
