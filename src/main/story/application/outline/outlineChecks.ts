import type { OutlineIssue, OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { OutlineValidationError } from "./outlineErrors.ts";

export type OutlineCheckContext = {
  readonly foreignNodeIds?: ReadonlySet<string>;
  readonly chapterRevisionIds?: ReadonlyMap<string, string | null>;
  readonly allocateId?: (prefix: string) => string;
};

const ACTIVE_ROLES = new Set(["focus", "active"]);

export function collectOutlineIssues(
  snapshot: OutlineSnapshot,
  context: OutlineCheckContext = {},
): OutlineIssue[] {
  const allocateId = context.allocateId ?? ((prefix: string) => `${prefix}_${crypto.randomUUID()}`);
  const foreignNodeIds = context.foreignNodeIds ?? new Set<string>();
  const chapterRevisionIds = context.chapterRevisionIds ?? new Map<string, string | null>();
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const issues: OutlineIssue[] = [];
  const push = (
    ruleCode: string,
    severity: OutlineIssue["severity"],
    nodeId: string | null,
    message: string,
    checkedRevision: number,
    extraFingerprint: readonly string[] = [],
  ) => {
    const fingerprint = [ruleCode, nodeId ?? "", String(checkedRevision), ...extraFingerprint].join("\u001f");
    issues.push({
      id: allocateId("issue"),
      outlineId: snapshot.outline.id,
      nodeId,
      ruleCode,
      severity,
      source: "rule",
      message,
      fingerprint,
      status: "open",
      checkedRevision,
      stale: false,
    });
  };

  for (const node of snapshot.nodes) {
    if (node.parentId === null) continue;
    if (!nodeIds.has(node.parentId)) {
      push("structure.missing_reference", "error", node.id, "引用不存在", node.revision);
    } else if (parentCycle(snapshot.nodes, node.id)) {
      push("structure.parent_cycle", "error", node.id, "父子成环", node.revision);
    }
  }

  for (const relation of snapshot.relations) {
    if (relation.sourceNodeId === relation.targetNodeId) {
      push("structure.relation_self_loop", "error", relation.sourceNodeId, "关系自环", revisionOf(snapshot, relation.sourceNodeId));
    }
    if (!nodeIds.has(relation.sourceNodeId) || !nodeIds.has(relation.targetNodeId)) {
      push("structure.missing_reference", "error", null, "引用不存在", snapshot.outline.revision);
    }
    const source = snapshot.nodes.find((node) => node.id === relation.sourceNodeId);
    const target = snapshot.nodes.find((node) => node.id === relation.targetNodeId);
    if (
      source &&
      target &&
      (relation.type === "requires" || relation.type === "causes") &&
      !relation.orderException &&
      source.narrativeOrder > target.narrativeOrder
    ) {
      push("relation.order", "warning", source.id, "因果或前置在叙述顺序上颠倒，且未标记倒叙例外", source.revision);
    }
  }

  for (const promise of snapshot.promises) {
    for (const nodeId of [promise.setupNodeId, promise.triggerNodeId, promise.payoffNodeId]) {
      if (nodeId === null) continue;
      if (foreignNodeIds.has(nodeId)) {
        push("promise.cross_outline", "error", null, "承诺跨大纲", snapshot.outline.revision);
      } else if (!nodeIds.has(nodeId)) {
        push("structure.missing_reference", "error", null, "引用不存在", snapshot.outline.revision);
      }
    }
    const setup = snapshot.nodes.find((node) => node.id === promise.setupNodeId);
    const payoff = snapshot.nodes.find((node) => node.id === promise.payoffNodeId);
    if (setup && payoff && payoff.narrativeOrder < setup.narrativeOrder) {
      push("promise.payoff_before_setup", "warning", payoff.id, "兑现节点早于铺设节点", payoff.revision);
    }
    if (promise.status === "seeded" && promise.payoffNodeId === null) {
      push("promise.seeded_without_payoff", "info", promise.setupNodeId, "已铺设承诺没有兑现节点", setup?.revision ?? snapshot.outline.revision);
    }
  }

  const ordered = [...snapshot.nodes].sort(
    (left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous || !current) continue;
    if (
      previous.locationText.trim() !== "" &&
      current.locationText.trim() !== "" &&
      previous.locationText !== current.locationText &&
      current.narrativeFunction !== "transition" &&
      current.notes.trim() === ""
    ) {
      push("participant.location_jump", "warning", current.id, "地点变化但没有过渡或说明", current.revision);
    }
  }

  for (const node of snapshot.nodes) {
    const leaf = isLeaf(snapshot, node.id);
    if (leaf && node.status === "confirmed" && node.goal.trim() === "" && node.conflict.trim() === "") {
      push("node.confirmed_empty", "warning", node.id, "已确认叶子没有目标也没有冲突", node.revision);
    }
    if (leaf && node.status === "confirmed" && !snapshot.mappings.some((mapping) => mapping.nodeId === node.id)) {
      push("node.unmapped_leaf", "info", node.id, "已确认叶子未映射", node.revision);
    }
    for (const participant of snapshot.participants) {
      if (participant.nodeId !== node.id || !ACTIVE_ROLES.has(participant.role)) continue;
      if (participant.stateBefore.trim() === "") {
        push("participant.missing_state", "warning", node.id, "主动参与者缺少事件前状态", node.revision);
      }
    }
  }

  for (const mapping of snapshot.mappings) {
    if (mapping.verificationChapterRevisionId === null) continue;
    const currentRevision = chapterRevisionIds.get(mapping.chapterId) ?? null;
    if (currentRevision === mapping.verificationChapterRevisionId) continue;
    const node = snapshot.nodes.find((item) => item.id === mapping.nodeId);
    push(
      "coverage.revision_drift",
      "warning",
      mapping.nodeId,
      "覆盖所依据的章节修订已不是当前修订",
      node?.revision ?? snapshot.outline.revision,
      [String(snapshot.outline.revision), currentRevision ?? ""],
    );
  }

  return issues;
}

export function issueIsStale(
  issue: OutlineIssue,
  snapshot: OutlineSnapshot,
  chapterRevisionIds: ReadonlyMap<string, string | null>,
): boolean {
  if (issue.nodeId) {
    const node = snapshot.nodes.find((item) => item.id === issue.nodeId);
    if (!node || node.revision !== issue.checkedRevision) return true;
  } else if (issue.checkedRevision !== snapshot.outline.revision) {
    return true;
  }
  if (!issue.ruleCode.startsWith("coverage.")) return false;
  const parts = issue.fingerprint.split("\u001f");
  if (parts.length < 5) return false;
  const outlineRevision = Number(parts[3]);
  const chapterRevisionId = parts[4] ?? "";
  if (!Number.isInteger(outlineRevision) || outlineRevision !== snapshot.outline.revision) return true;
  const mapping = snapshot.mappings.find((item) => item.nodeId === issue.nodeId);
  const current = mapping ? (chapterRevisionIds.get(mapping.chapterId) ?? "") : "";
  return current !== chapterRevisionId;
}

export function assertNoBlockingIssues(issues: readonly OutlineIssue[]): void {
  const blocking = issues.find((issue) => issue.severity === "error");
  if (!blocking) return;
  throw new OutlineValidationError(blocking.message);
}

export function isLeaf(snapshot: Pick<OutlineSnapshot, "nodes">, nodeId: string): boolean {
  return !snapshot.nodes.some((node) => node.parentId === nodeId);
}

function parentCycle(nodes: OutlineSnapshot["nodes"], nodeId: string): boolean {
  let current = nodes.find((node) => node.id === nodeId)?.parentId ?? null;
  const seen = new Set<string>();
  while (current) {
    if (current === nodeId || seen.has(current)) return true;
    seen.add(current);
    current = nodes.find((node) => node.id === current)?.parentId ?? null;
  }
  return false;
}

function revisionOf(snapshot: OutlineSnapshot, nodeId: string): number {
  return snapshot.nodes.find((node) => node.id === nodeId)?.revision ?? snapshot.outline.revision;
}
