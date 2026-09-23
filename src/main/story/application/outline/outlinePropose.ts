import { z } from "zod";
import {
  OUTLINE_NARRATIVE_FUNCTIONS,
  OUTLINE_NODE_KINDS,
  OUTLINE_NODE_STATUSES,
  OUTLINE_PARTICIPANT_ROLES,
  OUTLINE_PLANNING_MODES,
  OUTLINE_PROMISE_STATUSES,
  OUTLINE_PROPOSAL_MAX_NEW_NODES,
  OUTLINE_RELATION_TYPES,
  OUTLINE_STRUCTURAL_ROLES,
  type OutlinePatchOperation,
  type OutlinePlanningMode,
  type OutlineProposalProblem,
  type OutlineSnapshot,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import { outlineProposePrompt } from "../../resources/prompts/outlinePropose.prompt.ts";
import { OutlineModelError, OutlineProposalError, OutlineValidationError } from "./outlineErrors.ts";
import { isLeaf } from "./outlineChecks.ts";

const participantSchema = z.object({
  participantName: z.string(),
  role: z.enum(OUTLINE_PARTICIPANT_ROLES),
  stateBefore: z.string(),
  stateAfter: z.string(),
});

const createValueSchema = z.object({
  parentId: z.string().nullable(),
  kind: z.enum(OUTLINE_NODE_KINDS),
  title: z.string(),
  summary: z.string(),
  structuralRole: z.enum(OUTLINE_STRUCTURAL_ROLES),
  narrativeFunction: z.enum(OUTLINE_NARRATIVE_FUNCTIONS),
  goal: z.string(),
  conflict: z.string(),
  outcome: z.string(),
  locationText: z.string(),
  timeText: z.string(),
  storyOrder: z.number().int(),
  narrativeOrder: z.number().int(),
  status: z.enum(OUTLINE_NODE_STATUSES),
  notes: z.string(),
  participants: z.array(participantSchema),
});

const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_node"), tempId: z.string().min(1), value: createValueSchema }),
  z.object({
    type: z.literal("update_node"),
    nodeId: z.string().min(1),
    changes: createValueSchema.partial(),
  }),
  z.object({
    type: z.literal("move_node"),
    nodeId: z.string().min(1),
    parentId: z.string().nullable(),
    order: z.number().int(),
  }),
  z.object({ type: z.literal("delete_node"), nodeId: z.string().min(1) }),
  z.object({
    type: z.literal("upsert_relation"),
    value: z.object({
      id: z.string().min(1).optional(),
      sourceNodeId: z.string().min(1),
      targetNodeId: z.string().min(1),
      type: z.enum(OUTLINE_RELATION_TYPES),
      description: z.string(),
      orderException: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("upsert_promise"),
    value: z.object({
      id: z.string().min(1).optional(),
      title: z.string(),
      setup: z.string(),
      triggerCondition: z.string(),
      payoffRequirement: z.string(),
      status: z.enum(OUTLINE_PROMISE_STATUSES),
      setupNodeId: z.string().nullable(),
      triggerNodeId: z.string().nullable(),
      payoffNodeId: z.string().nullable(),
      notes: z.string(),
      reason: z.string(),
    }),
  }),
]);

const proposalSchema = z.object({
  summary: z.string().min(1),
  operations: z.array(operationSchema).min(1),
});

export function renderOutlineProposalPrompt(
  snapshot: OutlineSnapshot | null,
  parentNodeId: string | null,
  planningMode: OutlinePlanningMode,
): string {
  if (!OUTLINE_PLANNING_MODES.includes(planningMode)) {
    throw new OutlineValidationError("规划模式枚举非法");
  }
  const parent = parentNodeId ? snapshot?.nodes.find((node) => node.id === parentNodeId) : undefined;
  if (parentNodeId && snapshot && !parent) throw new OutlineValidationError("引用不存在");
  const ancestors = parent ? ancestorTitles(snapshot, parent.id) : [];
  const siblings =
    snapshot?.nodes.filter((node) => node.parentId === (parent?.id ?? null)).map((node) => node.title) ?? [];
  const leaves =
    snapshot?.nodes.filter((node) => isLeaf(snapshot, node.id)).map((node) => `${node.title}：${node.summary}`) ??
    [];
  const order =
    planningMode === "climax-first"
      ? "先给出高潮叶子，再补上升和下降，仍然只输出一层。"
      : "按前提顺序展开下一层。";
  return [
    outlineProposePrompt,
    order,
    snapshot
      ? `硬约束：主题 ${snapshot.outline.theme}；核心冲突 ${snapshot.outline.coreConflict}；结局 ${snapshot.outline.endingIntent}`
      : "当前没有大纲。只提议第一层事件。",
    ancestors.length > 0 ? `祖先：${ancestors.join(" / ")}` : "",
    `同级标题：${siblings.join("、")}`,
    `紧邻叶子：${leaves.slice(0, 2).join("；")}`,
    parent ? `展开节点：${parent.title}` : "展开根层",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function readProposalOperations(
  text: string,
): { readonly summary: string; readonly operations: readonly OutlinePatchOperation[] } | { readonly problems: readonly OutlineProposalProblem[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (error) {
    throw new OutlineModelError(error instanceof Error ? error.message : "模型输出不是有效的大纲候选。");
  }
  const result = proposalSchema.safeParse(parsed);
  if (!result.success) {
    return {
      problems: result.error.issues.map((issue) => ({
        tempId: tempIdFrom(parsed, issue.path),
        message: repairMessage(issue.path, issue.message),
      })),
    };
  }
  const creates = result.data.operations.filter((operation) => operation.type === "create_node");
  if (creates.length > OUTLINE_PROPOSAL_MAX_NEW_NODES) {
    throw new OutlineProposalError("一次新增超过 8 条");
  }
  const tempIds = new Set(creates.map((operation) => operation.tempId));
  if (creates.some((operation) => operation.value.parentId !== null && tempIds.has(operation.value.parentId))) {
    throw new OutlineProposalError("展开超过一层");
  }
  const problems: OutlineProposalProblem[] = [];
  for (const operation of creates) {
    if (operation.value.title.trim() === "") {
      problems.push({ tempId: operation.tempId, message: "缺少标题" });
    }
    if (operation.value.goal.trim() === "" && operation.value.conflict.trim() === "") {
      problems.push({ tempId: operation.tempId, message: "缺目标且缺冲突" });
    }
    for (const participant of operation.value.participants) {
      if (participant.participantName.trim() === "") {
        problems.push({ tempId: operation.tempId, message: "参与者名字不能为空" });
      }
    }
  }
  if (problems.length > 0) return { problems };
  return { summary: result.data.summary, operations: result.data.operations };
}

function ancestorTitles(snapshot: OutlineSnapshot | null, nodeId: string): string[] {
  if (!snapshot) return [];
  const titles: string[] = [];
  let parentId = snapshot.nodes.find((node) => node.id === nodeId)?.parentId ?? null;
  while (parentId) {
    const parent = snapshot.nodes.find((node) => node.id === parentId);
    if (!parent) break;
    titles.push(parent.title);
    parentId = parent.parentId;
  }
  return titles.reverse();
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced?.[1]?.trim() || trimmed;
}

function tempIdFrom(value: unknown, path: PropertyKey[]): string | null {
  if (!value || typeof value !== "object" || !("operations" in value)) return null;
  const operations = (value as { operations?: unknown }).operations;
  const index = path.find((part) => typeof part === "number");
  if (!Array.isArray(operations) || typeof index !== "number") return null;
  const operation = operations[index];
  if (!operation || typeof operation !== "object" || !("tempId" in operation)) return null;
  return typeof operation.tempId === "string" ? operation.tempId : null;
}

function repairMessage(path: PropertyKey[], fallback: string): string {
  const joined = path.map(String).join(".");
  if (joined.endsWith("title")) return "缺少标题";
  if (joined.endsWith("parentId")) return "非法父节点";
  if (joined.includes("participantName")) return "参与者名字不能为空";
  if (fallback.toLowerCase().includes("enum")) return "枚举非法";
  return `模型输出不完整：${joined || fallback}`;
}
