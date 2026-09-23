import {
  OUTLINE_LIMITS,
  OUTLINE_NARRATIVE_FUNCTIONS,
  OUTLINE_NODE_KINDS,
  OUTLINE_NODE_STATUSES,
  OUTLINE_PARTICIPANT_ROLES,
  OUTLINE_PROMISE_STATUSES,
  OUTLINE_RELATION_TYPES,
  OUTLINE_STRUCTURAL_ROLES,
  outlineTextLength,
  type CreateNodeInput,
  type NarrativePromise,
  type OutlineIssue,
  type OutlineNode,
  type OutlineNodeParticipant,
  type OutlineNodeRelation,
  type OutlinePatch,
  type OutlinePatchOperation,
  type OutlinePatchPreview,
  type OutlineParticipantInput,
  type OutlineSnapshot,
  type PromiseInput,
  type RelationInput,
  type UpdateNodeInput,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import {
  OutlineRepairableError,
  OutlineRevisionConflict,
  OutlineValidationError,
} from "./outlineErrors.ts";

export type OutlinePatchSimulation = {
  readonly snapshot: OutlineSnapshot;
  readonly affectedNodeIds: readonly string[];
  readonly preview: OutlinePatchPreview;
};

type WorkingSnapshot = {
  outline: OutlineSnapshot["outline"];
  nodes: OutlineNode[];
  relations: OutlineNodeRelation[];
  mappings: OutlineSnapshot["mappings"][number][];
  participants: OutlineNodeParticipant[];
  promises: NarrativePromise[];
  issues: OutlineIssue[];
};

const PROMISE_REASON_STATUSES = new Set(["paid_off", "eligible"]);

export function simulateOutlinePatch(
  snapshot: OutlineSnapshot,
  patch: OutlinePatch,
  allocateId: (prefix: string) => string,
  foreignNodeIds: ReadonlySet<string>,
  now = new Date().toISOString(),
): OutlinePatchSimulation {
  if (patch.outlineId !== snapshot.outline.id) {
    throw new OutlineValidationError("引用不存在");
  }
  if (patch.expectedRevision !== snapshot.outline.revision) {
    throw new OutlineRevisionConflict(snapshot.outline.revision);
  }
  if (patch.operations.length === 0) {
    throw new OutlineValidationError("patch 没有操作");
  }

  const working = structuredClone(snapshot) as WorkingSnapshot;
  const tempIds = new Map<string, string>();
  const affected = new Set<string>();
  const preview: {
    childNodeIds: string[];
    relationIds: string[];
    mappings: { nodeId: string; chapterId: string }[];
    promiseIds: string[];
  } = { childNodeIds: [], relationIds: [], mappings: [], promiseIds: [] };
  const detachedPromises = new Set<string>();

  for (const operation of patch.operations) {
    applyOperation(working, operation, tempIds, affected, preview, detachedPromises, allocateId, foreignNodeIds, now);
  }

  if (detachedPromises.size > 0) {
    const checkedRevision = snapshot.outline.revision + 1;
    working.issues.push({
      id: allocateId("issue"),
      outlineId: working.outline.id,
      nodeId: null,
      ruleCode: "promise.node_deleted",
      severity: "warning",
      source: "rule",
      message: `删除节点后，承诺失去节点引用：${[...detachedPromises].join(",")}`,
      fingerprint: `promise.node_deleted\u001f\u001f${checkedRevision}`,
      status: "open",
      checkedRevision,
      stale: false,
    });
  }

  working.outline = {
    ...working.outline,
    revision: snapshot.outline.revision + 1,
    updatedAt: now,
  };
  return {
    snapshot: working,
    affectedNodeIds: [...affected],
    preview,
  };
}

function applyOperation(
  working: WorkingSnapshot,
  operation: OutlinePatchOperation,
  tempIds: Map<string, string>,
  affected: Set<string>,
  preview: OutlinePatchPreviewMutable,
  detachedPromises: Set<string>,
  allocateId: (prefix: string) => string,
  foreignNodeIds: ReadonlySet<string>,
  now: string,
): void {
  switch (operation.type) {
    case "create_node":
      createNode(working, operation.tempId, operation.value, tempIds, affected, allocateId, now);
      return;
    case "update_node":
      updateNode(working, resolveRequired(operation.nodeId, tempIds), operation.changes, affected, now);
      return;
    case "move_node":
      moveNode(
        working,
        resolveRequired(operation.nodeId, tempIds),
        resolveOptional(operation.parentId, tempIds),
        operation.order,
        affected,
        now,
      );
      return;
    case "delete_node":
      deleteNode(
        working,
        resolveRequired(operation.nodeId, tempIds),
        affected,
        preview,
        detachedPromises,
      );
      return;
    case "upsert_relation":
      upsertRelation(working, operation.value, tempIds, affected, allocateId, now);
      return;
    case "upsert_promise":
      upsertPromise(working, operation.value, tempIds, foreignNodeIds, allocateId, now);
      return;
    default:
      throw new OutlineValidationError("枚举非法");
  }
}

type OutlinePatchPreviewMutable = {
  childNodeIds: string[];
  relationIds: string[];
  mappings: { nodeId: string; chapterId: string }[];
  promiseIds: string[];
};

function createNode(
  working: WorkingSnapshot,
  tempId: string,
  value: CreateNodeInput,
  tempIds: Map<string, string>,
  affected: Set<string>,
  allocateId: (prefix: string) => string,
  now: string,
): void {
  if (typeof tempId !== "string" || tempId.trim() === "") {
    throw new OutlineRepairableError([{ tempId: null, message: "缺少临时 id" }]);
  }
  if (tempIds.has(tempId) || working.nodes.some((node) => node.id === tempId)) {
    throw new OutlineValidationError("模型不能指定最终 id");
  }
  const title = requireNodeTitle(value.title, tempId);
  const parentId = resolveOptional(value.parentId, tempIds);
  if (parentId !== null && !working.nodes.some((node) => node.id === parentId)) {
    throw new OutlineRepairableError([{ tempId, message: "非法父节点" }]);
  }
  const id = allocateId("node");
  const node: OutlineNode = {
    id,
    outlineId: working.outline.id,
    parentId,
    kind: requireMember(value.kind, OUTLINE_NODE_KINDS, "节点类型"),
    title,
    summary: requireBounded(value.summary, OUTLINE_LIMITS.summary, "摘要"),
    structuralRole: requireMember(value.structuralRole, OUTLINE_STRUCTURAL_ROLES, "结构角色"),
    narrativeFunction: requireMember(value.narrativeFunction, OUTLINE_NARRATIVE_FUNCTIONS, "叙事功能"),
    goal: requireBounded(value.goal, OUTLINE_LIMITS.goal, "目标"),
    conflict: requireBounded(value.conflict, OUTLINE_LIMITS.conflict, "冲突"),
    outcome: requireBounded(value.outcome, OUTLINE_LIMITS.outcome, "结果"),
    locationText: requireBounded(value.locationText, OUTLINE_LIMITS.locationText, "地点"),
    timeText: requireBounded(value.timeText, OUTLINE_LIMITS.timeText, "时间"),
    storyOrder: requireInteger(value.storyOrder, "storyOrder"),
    narrativeOrder: requireInteger(value.narrativeOrder, "narrativeOrder"),
    status: requireMember(value.status, OUTLINE_NODE_STATUSES, "节点状态"),
    notes: requireBounded(value.notes, OUTLINE_LIMITS.notes, "备注"),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (createsCycle(working.nodes, id, parentId)) {
    throw new OutlineValidationError("父子成环");
  }
  working.nodes.push(node);
  replaceParticipants(working, id, value.participants);
  tempIds.set(tempId, id);
  affected.add(id);
}

function updateNode(
  working: WorkingSnapshot,
  nodeId: string,
  changes: UpdateNodeInput,
  affected: Set<string>,
  now: string,
): void {
  const index = working.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw new OutlineValidationError("引用不存在");
  const current = working.nodes[index];
  if (!current) throw new OutlineValidationError("引用不存在");
  const parentId = Object.hasOwn(changes, "parentId")
    ? changes.parentId ?? null
    : current.parentId;
  if (parentId !== null && !working.nodes.some((node) => node.id === parentId)) {
    throw new OutlineRepairableError([{ tempId: nodeId, message: "非法父节点" }]);
  }
  if (createsCycle(working.nodes, nodeId, parentId)) {
    throw new OutlineValidationError("父子成环");
  }
  const next: OutlineNode = {
    ...current,
    parentId,
    kind: changes.kind === undefined ? current.kind : requireMember(changes.kind, OUTLINE_NODE_KINDS, "节点类型"),
    title: changes.title === undefined ? current.title : requireNodeTitle(changes.title, nodeId),
    summary:
      changes.summary === undefined
        ? current.summary
        : requireBounded(changes.summary, OUTLINE_LIMITS.summary, "摘要"),
    structuralRole:
      changes.structuralRole === undefined
        ? current.structuralRole
        : requireMember(changes.structuralRole, OUTLINE_STRUCTURAL_ROLES, "结构角色"),
    narrativeFunction:
      changes.narrativeFunction === undefined
        ? current.narrativeFunction
        : requireMember(changes.narrativeFunction, OUTLINE_NARRATIVE_FUNCTIONS, "叙事功能"),
    goal: changes.goal === undefined ? current.goal : requireBounded(changes.goal, OUTLINE_LIMITS.goal, "目标"),
    conflict:
      changes.conflict === undefined
        ? current.conflict
        : requireBounded(changes.conflict, OUTLINE_LIMITS.conflict, "冲突"),
    outcome:
      changes.outcome === undefined
        ? current.outcome
        : requireBounded(changes.outcome, OUTLINE_LIMITS.outcome, "结果"),
    locationText:
      changes.locationText === undefined
        ? current.locationText
        : requireBounded(changes.locationText, OUTLINE_LIMITS.locationText, "地点"),
    timeText:
      changes.timeText === undefined
        ? current.timeText
        : requireBounded(changes.timeText, OUTLINE_LIMITS.timeText, "时间"),
    storyOrder:
      changes.storyOrder === undefined ? current.storyOrder : requireInteger(changes.storyOrder, "storyOrder"),
    narrativeOrder:
      changes.narrativeOrder === undefined
        ? current.narrativeOrder
        : requireInteger(changes.narrativeOrder, "narrativeOrder"),
    status:
      changes.status === undefined
        ? current.status
        : requireMember(changes.status, OUTLINE_NODE_STATUSES, "节点状态"),
    notes: changes.notes === undefined ? current.notes : requireBounded(changes.notes, OUTLINE_LIMITS.notes, "备注"),
    revision: current.revision + 1,
    updatedAt: now,
  };
  working.nodes[index] = next;
  if (changes.participants) replaceParticipants(working, nodeId, changes.participants);
  affected.add(nodeId);
}

function moveNode(
  working: WorkingSnapshot,
  nodeId: string,
  parentId: string | null,
  order: number,
  affected: Set<string>,
  now: string,
): void {
  const index = working.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw new OutlineValidationError("引用不存在");
  if (parentId !== null && !working.nodes.some((node) => node.id === parentId)) {
    throw new OutlineRepairableError([{ tempId: nodeId, message: "非法父节点" }]);
  }
  if (createsCycle(working.nodes, nodeId, parentId)) {
    throw new OutlineValidationError("父子成环");
  }
  const current = working.nodes[index];
  if (!current) throw new OutlineValidationError("引用不存在");
  working.nodes[index] = {
    ...current,
    parentId,
    narrativeOrder: requireInteger(order, "order"),
    revision: current.revision + 1,
    updatedAt: now,
  };
  affected.add(nodeId);
}

function deleteNode(
  working: WorkingSnapshot,
  nodeId: string,
  affected: Set<string>,
  preview: OutlinePatchPreviewMutable,
  detachedPromises: Set<string>,
): void {
  if (!working.nodes.some((node) => node.id === nodeId)) {
    throw new OutlineValidationError("引用不存在");
  }
  const children = collectDescendants(working.nodes, nodeId);
  const removed = new Set([nodeId, ...children]);
  preview.childNodeIds.push(...children);
  for (const relation of working.relations) {
    if (removed.has(relation.sourceNodeId) || removed.has(relation.targetNodeId)) {
      preview.relationIds.push(relation.id);
    }
  }
  for (const mapping of working.mappings) {
    if (removed.has(mapping.nodeId)) preview.mappings.push({ nodeId: mapping.nodeId, chapterId: mapping.chapterId });
  }
  for (const promise of working.promises) {
    if (
      (promise.setupNodeId !== null && removed.has(promise.setupNodeId)) ||
      (promise.triggerNodeId !== null && removed.has(promise.triggerNodeId)) ||
      (promise.payoffNodeId !== null && removed.has(promise.payoffNodeId))
    ) {
      preview.promiseIds.push(promise.id);
      detachedPromises.add(promise.id);
    }
  }
  working.nodes = working.nodes.filter((node) => !removed.has(node.id));
  working.relations = working.relations.filter(
    (relation) => !removed.has(relation.sourceNodeId) && !removed.has(relation.targetNodeId),
  );
  working.mappings = working.mappings.filter((mapping) => !removed.has(mapping.nodeId));
  working.participants = working.participants.filter((participant) => !removed.has(participant.nodeId));
  working.promises = working.promises.map((promise) => ({
    ...promise,
    setupNodeId: promise.setupNodeId !== null && removed.has(promise.setupNodeId) ? null : promise.setupNodeId,
    triggerNodeId:
      promise.triggerNodeId !== null && removed.has(promise.triggerNodeId) ? null : promise.triggerNodeId,
    payoffNodeId: promise.payoffNodeId !== null && removed.has(promise.payoffNodeId) ? null : promise.payoffNodeId,
  }));
  working.issues = working.issues.map((issue) =>
    issue.nodeId !== null && removed.has(issue.nodeId) ? { ...issue, nodeId: null } : issue,
  );
  for (const id of removed) affected.add(id);
}

function upsertRelation(
  working: WorkingSnapshot,
  value: RelationInput,
  tempIds: Map<string, string>,
  affected: Set<string>,
  allocateId: (prefix: string) => string,
  now: string,
): void {
  const sourceNodeId = resolveRequired(value.sourceNodeId, tempIds);
  const targetNodeId = resolveRequired(value.targetNodeId, tempIds);
  if (sourceNodeId === targetNodeId) throw new OutlineValidationError("关系自环");
  if (!working.nodes.some((node) => node.id === sourceNodeId) || !working.nodes.some((node) => node.id === targetNodeId)) {
    throw new OutlineValidationError("引用不存在");
  }
  const type = requireMember(value.type, OUTLINE_RELATION_TYPES, "关系类型");
  const description = requireBounded(value.description, OUTLINE_LIMITS.relationDescription, "关系说明");
  if (typeof value.orderException !== "boolean") {
    throw new OutlineValidationError("倒叙例外必须是布尔值");
  }
  const existing = value.id
    ? working.relations.find((relation) => relation.id === value.id)
    : working.relations.find(
        (relation) =>
          relation.sourceNodeId === sourceNodeId &&
          relation.targetNodeId === targetNodeId &&
          relation.type === type,
      );
  if (value.id && !existing) throw new OutlineValidationError("引用不存在");
  if (existing) {
    const index = working.relations.findIndex((relation) => relation.id === existing.id);
    working.relations[index] = {
      ...existing,
      sourceNodeId,
      targetNodeId,
      type,
      description,
      orderException: value.orderException,
    };
  } else {
    working.relations.push({
      id: allocateId("relation"),
      outlineId: working.outline.id,
      sourceNodeId,
      targetNodeId,
      type,
      description,
      orderException: value.orderException,
      createdAt: now,
    });
  }
  affected.add(sourceNodeId);
  affected.add(targetNodeId);
}

function upsertPromise(
  working: WorkingSnapshot,
  value: PromiseInput,
  tempIds: Map<string, string>,
  foreignNodeIds: ReadonlySet<string>,
  allocateId: (prefix: string) => string,
  now: string,
): void {
  const status = requireMember(value.status, OUTLINE_PROMISE_STATUSES, "承诺状态");
  if (PROMISE_REASON_STATUSES.has(status) && value.reason.trim() === "") {
    throw new OutlineValidationError("承诺缺少 reason");
  }
  const setupNodeId = resolveNodeRef(value.setupNodeId, tempIds, working, foreignNodeIds);
  const triggerNodeId = resolveNodeRef(value.triggerNodeId, tempIds, working, foreignNodeIds);
  const payoffNodeId = resolveNodeRef(value.payoffNodeId, tempIds, working, foreignNodeIds);
  const next = {
    title: requireRequiredText(value.title, OUTLINE_LIMITS.promiseTitle, "承诺标题"),
    setup: requireBounded(value.setup, OUTLINE_LIMITS.promiseField, "铺设"),
    triggerCondition: requireBounded(value.triggerCondition, OUTLINE_LIMITS.promiseField, "触发条件"),
    payoffRequirement: requireBounded(value.payoffRequirement, OUTLINE_LIMITS.promiseField, "兑现要求"),
    status,
    setupNodeId,
    triggerNodeId,
    payoffNodeId,
    notes: requireBounded(value.notes, OUTLINE_LIMITS.promiseNotes, "承诺备注"),
    statusReason: requireBounded(value.reason, OUTLINE_LIMITS.reason, "reason"),
  };
  const existing = value.id ? working.promises.find((promise) => promise.id === value.id) : undefined;
  if (value.id && !existing) throw new OutlineValidationError("引用不存在");
  if (existing) {
    const index = working.promises.findIndex((promise) => promise.id === existing.id);
    working.promises[index] = {
      ...existing,
      ...next,
      revision: existing.revision + 1,
      updatedAt: now,
    };
    return;
  }
  working.promises.push({
    id: allocateId("promise"),
    outlineId: working.outline.id,
    ...next,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function resolveNodeRef(
  nodeId: string | null,
  tempIds: Map<string, string>,
  working: WorkingSnapshot,
  foreignNodeIds: ReadonlySet<string>,
): string | null {
  if (nodeId === null) return null;
  const resolved = resolveRequired(nodeId, tempIds);
  if (foreignNodeIds.has(resolved)) throw new OutlineValidationError("承诺跨大纲");
  if (!working.nodes.some((node) => node.id === resolved)) {
    throw new OutlineValidationError("引用不存在");
  }
  return resolved;
}

function replaceParticipants(
  working: WorkingSnapshot,
  nodeId: string,
  participants: readonly OutlineParticipantInput[],
): void {
  const names = new Set<string>();
  const next: OutlineNodeParticipant[] = [];
  for (const participant of participants) {
    const participantName = participant.participantName?.trim?.() ?? "";
    if (participantName === "") {
      throw new OutlineRepairableError([{ tempId: nodeId, message: "参与者名字不能为空" }]);
    }
    if (outlineTextLength(participantName) > OUTLINE_LIMITS.participantName) {
      throw new OutlineValidationError("参与者名字超过上限");
    }
    if (names.has(participantName)) throw new OutlineValidationError("参与者名字重复");
    names.add(participantName);
    next.push({
      nodeId,
      participantName,
      role: requireMember(participant.role, OUTLINE_PARTICIPANT_ROLES, "参与者角色"),
      stateBefore: requireBounded(participant.stateBefore, OUTLINE_LIMITS.participantState, "事件前状态"),
      stateAfter: requireBounded(participant.stateAfter, OUTLINE_LIMITS.participantState, "事件后变化"),
    });
  }
  working.participants = working.participants.filter((participant) => participant.nodeId !== nodeId).concat(next);
}

function resolveRequired(id: string, tempIds: Map<string, string>): string {
  if (typeof id !== "string" || id.trim() === "") throw new OutlineValidationError("引用不存在");
  return tempIds.get(id) ?? id;
}

function resolveOptional(id: string | null, tempIds: Map<string, string>): string | null {
  if (id === null) return null;
  return resolveRequired(id, tempIds);
}

function createsCycle(nodes: readonly OutlineNode[], nodeId: string, parentId: string | null): boolean {
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === nodeId || seen.has(current)) return true;
    seen.add(current);
    current = nodes.find((node) => node.id === current)?.parentId ?? null;
  }
  return false;
}

function collectDescendants(nodes: readonly OutlineNode[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const result: string[] = [];
  const stack = [...(children.get(rootId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

function requireNodeTitle(value: string, tempId: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OutlineRepairableError([{ tempId, message: "缺少标题" }]);
  }
  if (outlineTextLength(value) > OUTLINE_LIMITS.nodeTitle) {
    throw new OutlineValidationError("标题超过上限");
  }
  return value;
}

function requireRequiredText(value: string, max: number, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OutlineValidationError(`${label}不能为空`);
  }
  return requireBounded(value, max, label);
}

function requireBounded(value: string, max: number, label: string): string {
  if (typeof value !== "string") throw new OutlineValidationError(`${label}必须是字符串`);
  if (outlineTextLength(value) > max) throw new OutlineValidationError(`${label}超过上限`);
  return value;
}

function requireInteger(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new OutlineValidationError(`${label}必须是整数`);
  return value;
}

function requireMember<T extends string>(value: T, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value)) throw new OutlineValidationError(`${label}枚举非法`);
  return value;
}
