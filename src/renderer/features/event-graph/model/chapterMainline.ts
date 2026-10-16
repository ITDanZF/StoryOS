import type {
  OutlineNode,
  OutlineNodeStatus,
  OutlineSnapshot,
} from "../../../../shared/contracts/outline/outlineContracts.ts";

export type CoverageFreshness = "current" | "stale" | "unchecked";

export type MainlineLeaf = {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly segmentIntent: string;
  readonly expectedLocalChange: string;
  readonly coverageStatus: OutlineSnapshot["mappings"][number]["coverageStatus"];
  readonly status: OutlineNodeStatus;
  readonly freshness: CoverageFreshness;
  readonly label: string;
};

export type DeleteImpact = {
  readonly title: string;
  readonly chapters: readonly string[];
  readonly relationCount: number;
  readonly promises: readonly string[];
};

export type DeviationImpact = {
  readonly nextLeaf: OutlineNode | null;
  readonly relatedNodes: readonly OutlineNode[];
  readonly promises: readonly string[];
};

export function isOutlineLeaf(snapshot: OutlineSnapshot, id: string): boolean {
  return !snapshot.nodes.some((node) => node.parentId === id);
}

export function acceptedLeaves(snapshot: OutlineSnapshot, chapterId: string): OutlineNode[] {
  const mapped = new Set(
    snapshot.mappings.filter((mapping) => mapping.chapterId === chapterId).map((mapping) => mapping.nodeId),
  );
  return snapshot.nodes
    .filter((node) => (node.status === "confirmed" || node.status === "writing" || node.status === "covered") &&
      mapped.has(node.id) && isOutlineLeaf(snapshot, node.id))
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id));
}

export function chapterMainline(
  snapshot: OutlineSnapshot,
  chapterId: string,
  chapterRevisionId: string | null,
): readonly MainlineLeaf[] {
  const mapped = snapshot.mappings.filter((mapping) => mapping.chapterId === chapterId);
  return snapshot.nodes
    .filter((node) => isOutlineLeaf(snapshot, node.id) && mapped.some((mapping) => mapping.nodeId === node.id))
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id))
    .map((node) => {
      const mapping = mapped.find((item) => item.nodeId === node.id);
      const freshness = mapping
        ? coverageFreshness(mapping.verificationOutlineRevision, mapping.verificationChapterRevisionId, snapshot.outline.revision, chapterRevisionId)
        : "unchecked";
      return {
        id: node.id,
        title: node.title,
        goal: node.goal,
        conflict: node.conflict,
        outcome: node.outcome,
        segmentIntent: mapping?.segmentIntent ?? "",
        expectedLocalChange: mapping?.expectedLocalChange ?? "",
        coverageStatus: mapping?.coverageStatus ?? "planned",
        status: node.status,
        freshness,
        label: mapping?.coverageStatus === "drafted"
          ? freshness === "stale" ? "需要重新核对" : "待核验"
          : mapping?.coverageStatus === "verified"
            ? freshness === "stale" ? "需要重新核对" : "已覆盖"
            : mapping?.coverageStatus === "deviated" ? "需修订" : node.status === "draft" ? "草稿" : "已规划",
      };
    });
}

export function coverageFreshness(
  verificationOutlineRevision: number | null,
  verificationChapterRevisionId: string | null,
  outlineRevision: number,
  chapterRevisionId: string | null,
): CoverageFreshness {
  if (verificationOutlineRevision === null && verificationChapterRevisionId === null) return "unchecked";
  if (verificationOutlineRevision !== outlineRevision) return "stale";
  if (chapterRevisionId === null || verificationChapterRevisionId !== chapterRevisionId) return "stale";
  return "current";
}

export function nextTransitionLeaf(snapshot: OutlineSnapshot, selectedIds: readonly string[]): OutlineNode | null {
  const selected = new Set(selectedIds);
  const leaves = snapshot.nodes
    .filter((node) => isOutlineLeaf(snapshot, node.id))
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id));
  let lastIndex = -1;
  leaves.forEach((node, index) => {
    if (selected.has(node.id)) lastIndex = index;
  });
  return lastIndex >= 0 ? leaves[lastIndex + 1] ?? null : null;
}

export function deviationImpact(snapshot: OutlineSnapshot, nodeId: string): DeviationImpact {
  const source = snapshot.nodes.find((node) => node.id === nodeId);
  if (!source) return { nextLeaf: null, relatedNodes: [], promises: [] };
  const nextLeaf = nextTransitionLeaf(snapshot, [nodeId]);
  const relatedIds = new Set<string>();
  if (nextLeaf) relatedIds.add(nextLeaf.id);
  for (const relation of snapshot.relations) {
    if (relation.sourceNodeId !== nodeId) continue;
    const target = snapshot.nodes.find((node) => node.id === relation.targetNodeId);
    if (target && target.narrativeOrder > source.narrativeOrder) relatedIds.add(target.id);
  }
  const promises = snapshot.promises.filter((promise) =>
    promise.setupNodeId === nodeId || promise.triggerNodeId === nodeId || promise.payoffNodeId === nodeId,
  );
  for (const promise of promises) {
    if (!promise.payoffNodeId || promise.payoffNodeId === nodeId) continue;
    const payoff = snapshot.nodes.find((node) => node.id === promise.payoffNodeId);
    if (payoff && payoff.narrativeOrder > source.narrativeOrder) relatedIds.add(payoff.id);
  }
  return {
    nextLeaf,
    relatedNodes: snapshot.nodes
      .filter((node) => relatedIds.has(node.id))
      .sort((left, right) => left.narrativeOrder - right.narrativeOrder),
    promises: promises.map((promise) => promise.title),
  };
}

export function handoffGaps(snapshot: OutlineSnapshot | null, chapterId: string): readonly string[] {
  if (!snapshot) return ["这本书还没有事件图。"];
  const mapped = snapshot.mappings.filter((mapping) => mapping.chapterId === chapterId);
  if (mapped.length === 0) return ["这一章还没有叶子事件。"];
  const gaps: string[] = [];
  for (const mapping of mapped) {
    const node = snapshot.nodes.find((item) => item.id === mapping.nodeId);
    if (!node) continue;
    if (!isOutlineLeaf(snapshot, node.id)) gaps.push(`「${node.title}」还有子事件，不能进入本章写作。`);
    else if (node.status !== "confirmed" && node.status !== "writing" && node.status !== "covered") gaps.push(`「${node.title}」还是${statusText(node.status)}，确认后才能写作。`);
  }
  return gaps;
}

export function deleteImpact(snapshot: OutlineSnapshot, nodeId: string): DeleteImpact | null {
  const node = snapshot.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  return {
    title: node.title,
    chapters: snapshot.mappings.filter((mapping) => mapping.nodeId === nodeId).map((mapping) => mapping.chapterId),
    relationCount: snapshot.relations.filter((relation) => relation.sourceNodeId === nodeId || relation.targetNodeId === nodeId).length,
    promises: snapshot.promises
      .filter((promise) => promise.setupNodeId === nodeId || promise.triggerNodeId === nodeId || promise.payoffNodeId === nodeId)
      .map((promise) => promise.title),
  };
}

export function leafLabel(status: OutlineNodeStatus, freshness: CoverageFreshness): string {
  if (freshness === "stale" && (status === "writing" || status === "covered" || status === "needs_revision")) return "需要重新核对";
  if (status === "writing") return "待核验";
  if (status === "covered") return "已覆盖";
  if (status === "needs_revision") return "需修订";
  if (status === "confirmed") return "已确认";
  return "草稿";
}

function statusText(status: OutlineNodeStatus): string {
  if (status === "confirmed") return "已确认";
  if (status === "writing") return "待核验";
  if (status === "covered") return "已覆盖";
  if (status === "needs_revision") return "需修订";
  return "草稿";
}
