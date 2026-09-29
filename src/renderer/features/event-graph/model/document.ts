import type {
  CreateNodeInput,
  OutlineNarrativeFunction,
  OutlineNodeKind,
  OutlineNodeStatus,
  OutlineParticipantRole,
  OutlinePatchOperation,
  OutlineProposal,
  OutlineRelationType,
  OutlineSnapshot,
  OutlineStructuralRole,
  UpdateNodeInput,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import { STORY_ARCS, STORY_LEAVES, STORY_RELATIONS } from "./sampleStory.ts";

export const SAMPLE_CHAPTERS = [
  { id: "1", label: "第1章" },
  { id: "2", label: "第2章" },
  { id: "3", label: "第3章" },
] as const;

const ARC_ORDER = ["E5", "E2", "E1", "E3", "E4"] as const;

export const RELATION_LABEL: Readonly<Record<OutlineRelationType, string>> = {
  causes: "因果",
  requires: "前置",
  reveals: "揭示",
  foreshadows: "伏笔",
  contrasts: "对照",
};

export const NARRATIVE_FUNCTION_LABEL: Readonly<Record<OutlineNarrativeFunction, string>> = {
  action: "动作",
  dialogue: "对话",
  exposition: "说明",
  worldbuilding: "世界构建",
  relationship: "关系",
  mystery: "悬念",
  transition: "过渡",
  mixed: "混合",
};

export const PARTICIPANT_ROLE_LABEL: Readonly<Record<OutlineParticipantRole, string>> = {
  focus: "焦点",
  active: "主动",
  supporting: "配角",
  mentioned: "被提及",
};

export const NODE_STATUS_LABEL: Readonly<Record<OutlineNodeStatus, string>> = {
  draft: "草稿",
  confirmed: "已确认",
  writing: "写作中",
  covered: "已覆盖",
  needs_revision: "待修订",
};

export type ChapterOption = {
  readonly id: string;
  readonly label: string;
};

export type GraphParticipant = {
  readonly name: string;
  readonly role: OutlineParticipantRole;
  readonly stateBefore: string;
  readonly stateAfter: string;
};

export type GraphNode = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly kind: OutlineNodeKind;
  readonly parentId: string | null;
  readonly structuralRole: OutlineStructuralRole;
  readonly narrativeFunction: OutlineNarrativeFunction;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly locationText: string;
  readonly timeText: string;
  readonly storyOrder: number;
  readonly narrativeOrder: number;
  readonly status: OutlineNodeStatus;
  readonly notes: string;
  readonly participants: readonly GraphParticipant[];
  readonly chapterId: string | null;
  readonly proposal: boolean;
};

export type GraphRelation = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: OutlineRelationType;
  readonly description: string;
  readonly orderException: boolean;
  readonly proposal: boolean;
};

export type GraphDocument = {
  readonly source: "sample" | "outline";
  readonly outlineId: string | null;
  readonly revision: number;
  readonly title: string;
  readonly nodes: readonly GraphNode[];
  readonly relations: readonly GraphRelation[];
};

export type NextNodeInput = {
  readonly title: string;
  readonly summary: string;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly timeText: string;
  readonly locationText: string;
  readonly participants: readonly GraphParticipant[];
  readonly link: "child" | "sibling";
  readonly relation: {
    readonly type: OutlineRelationType;
    readonly description: string;
    readonly direction: "out" | "in";
  } | null;
};

export type ProposalPreview = {
  readonly summary: string;
  readonly nodes: readonly GraphNode[];
  readonly relations: readonly GraphRelation[];
  readonly updatedNodeIds: readonly string[];
  readonly problems: readonly string[];
};

export type ProseBrief = {
  readonly blockers: readonly string[];
  readonly chapterId: string | null;
  readonly chapterLabel: string | null;
  readonly nodes: readonly { readonly id: string; readonly title: string; readonly goal: string; readonly conflict: string; readonly outcome: string }[];
  readonly internalEdges: readonly { readonly fromTitle: string; readonly toTitle: string; readonly type: string; readonly description: string }[];
  readonly externalEdges: readonly { readonly fromTitle: string; readonly toTitle: string; readonly type: string; readonly description: string }[];
  readonly orderNote: string;
};

export function sampleDocument(): GraphDocument {
  const arcs: GraphNode[] = STORY_ARCS.map((arc): GraphNode => ({
    id: arc.id,
    title: arc.name,
    summary: arc.outcome,
    kind: "arc",
    parentId: null,
    structuralRole: "custom",
    narrativeFunction: "mixed",
    goal: arc.goal,
    conflict: arc.conflict,
    outcome: arc.outcome,
    locationText: arc.locationText,
    timeText: arc.timeText,
    storyOrder: ARC_ORDER.indexOf(arc.id as (typeof ARC_ORDER)[number]),
    narrativeOrder: ARC_ORDER.indexOf(arc.id as (typeof ARC_ORDER)[number]),
    status: "draft",
    notes: "",
    participants: people(arc.people),
    chapterId: null,
    proposal: false,
  }));
  const leaves: GraphNode[] = STORY_LEAVES.map((leaf): GraphNode => ({
    id: leaf.id,
    title: leaf.name,
    summary: leaf.outcome,
    kind: "event",
    parentId: leaf.parent,
    structuralRole: "custom",
    narrativeFunction: "mixed",
    goal: leaf.goal,
    conflict: leaf.conflict,
    outcome: leaf.outcome,
    locationText: leaf.locationText,
    timeText: leaf.timeText,
    storyOrder: leaf.story,
    narrativeOrder: leaf.narrative,
    status: "draft",
    notes: "",
    participants: people(leaf.people),
    chapterId: sampleChapterId(leaf.chapter),
    proposal: false,
  }));
  return {
    source: "sample",
    outlineId: null,
    revision: 0,
    title: "沈衡与梁秋",
    nodes: [...arcs, ...leaves],
    relations: STORY_RELATIONS.map((relation) => ({
      id: `${relation.type}:${relation.from}:${relation.to}`,
      from: relation.from,
      to: relation.to,
      type: relation.type,
      description: relation.detail,
      orderException: false,
      proposal: false,
    })),
  };
}

export function documentFromSnapshot(snapshot: OutlineSnapshot): GraphDocument {
  const chapterOf = new Map<string, string>();
  for (const mapping of snapshot.mappings) {
    if (!chapterOf.has(mapping.nodeId)) chapterOf.set(mapping.nodeId, mapping.chapterId);
  }
  const grouped = new Map<string, GraphParticipant[]>();
  for (const participant of snapshot.participants) {
    const list = grouped.get(participant.nodeId) ?? [];
    list.push({
      name: participant.participantName,
      role: participant.role,
      stateBefore: participant.stateBefore,
      stateAfter: participant.stateAfter,
    });
    grouped.set(participant.nodeId, list);
  }
  return {
    source: "outline",
    outlineId: snapshot.outline.id,
    revision: snapshot.outline.revision,
    title: snapshot.outline.title,
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary,
      kind: node.kind,
      parentId: node.parentId,
      structuralRole: node.structuralRole,
      narrativeFunction: node.narrativeFunction,
      goal: node.goal,
      conflict: node.conflict,
      outcome: node.outcome,
      locationText: node.locationText,
      timeText: node.timeText,
      storyOrder: node.storyOrder,
      narrativeOrder: node.narrativeOrder,
      status: node.status,
      notes: node.notes,
      participants: grouped.get(node.id) ?? [],
      chapterId: chapterOf.get(node.id) ?? null,
      proposal: false,
    })),
    relations: snapshot.relations.map((relation) => ({
      id: relation.id,
      from: relation.sourceNodeId,
      to: relation.targetNodeId,
      type: relation.type,
      description: relation.description,
      orderException: relation.orderException,
      proposal: false,
    })),
  };
}

export function chapterOptions(document: GraphDocument, chapters: readonly ChapterOption[]): readonly ChapterOption[] {
  if (document.source === "sample") return SAMPLE_CHAPTERS;
  const known = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  for (const node of document.nodes) {
    if (node.chapterId && !known.has(node.chapterId)) {
      known.set(node.chapterId, { id: node.chapterId, label: "未命名章节" });
    }
  }
  return [...known.values()];
}

export function isLeaf(document: GraphDocument, id: string): boolean {
  return !document.nodes.some((node) => node.parentId === id);
}

export function descendantIds(document: GraphDocument, id: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (current: string) => {
    for (const node of document.nodes) {
      if (node.parentId !== current || ids.has(node.id)) continue;
      ids.add(node.id);
      visit(node.id);
    }
  };
  visit(id);
  return ids;
}

export function replaceNode(document: GraphDocument, id: string, node: GraphNode): GraphDocument {
  return { ...document, nodes: document.nodes.map((item) => (item.id === id ? node : item)) };
}

export function assignChapter(document: GraphDocument, id: string, chapterId: string | null): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === id ? { ...node, chapterId } : node)),
  };
}

export function upsertRelation(document: GraphDocument, relation: GraphRelation): GraphDocument {
  const exists = document.relations.some((item) => item.id === relation.id);
  return {
    ...document,
    relations: exists
      ? document.relations.map((item) => (item.id === relation.id ? relation : item))
      : [...document.relations, relation],
  };
}

export function removeRelation(document: GraphDocument, id: string): GraphDocument {
  return { ...document, relations: document.relations.filter((relation) => relation.id !== id) };
}

export function toCreateInput(node: GraphNode): CreateNodeInput {
  return {
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    structuralRole: node.structuralRole,
    narrativeFunction: node.narrativeFunction,
    goal: node.goal,
    conflict: node.conflict,
    outcome: node.outcome,
    locationText: node.locationText,
    timeText: node.timeText,
    storyOrder: node.storyOrder,
    narrativeOrder: node.narrativeOrder,
    status: node.status,
    notes: node.notes,
    participants: node.participants.map((participant) => ({
      participantName: participant.name,
      role: participant.role,
      stateBefore: participant.stateBefore,
      stateAfter: participant.stateAfter,
    })),
  };
}

export function toUpdateInput(node: GraphNode): UpdateNodeInput {
  return toCreateInput(node);
}

export function planNextNode(
  document: GraphDocument,
  fromId: string,
  input: NextNodeInput,
  tempId: string,
): { readonly document: GraphDocument; readonly operations: readonly OutlinePatchOperation[] } {
  const from = document.nodes.find((node) => node.id === fromId);
  if (!from) throw new Error("引用不存在");
  const kind: OutlineNodeKind = input.link === "child" || from.kind !== "arc" ? "event" : "arc";
  const parentId = input.link === "child" ? from.id : from.parentId;
  const placement = nextOrders(document, from, kind, input.link);
  const created: GraphNode = {
    id: tempId,
    title: input.title.trim(),
    summary: input.summary,
    kind,
    parentId,
    structuralRole: "custom",
    narrativeFunction: "mixed",
    goal: input.goal,
    conflict: input.conflict,
    outcome: input.outcome,
    locationText: input.locationText,
    timeText: input.timeText,
    storyOrder: placement.storyOrder,
    narrativeOrder: placement.narrativeOrder,
    status: "draft",
    notes: "",
    participants: input.participants.filter((participant) => participant.name.trim() !== ""),
    chapterId: input.link === "sibling" ? from.chapterId : null,
    proposal: false,
  };
  const nodes = document.nodes.map((node) => {
    const next = placement.shifts.get(node.id);
    return next ? { ...node, storyOrder: next.storyOrder, narrativeOrder: next.narrativeOrder } : node;
  });
  const relation = input.relation
    ? {
        id: `rel-${tempId}`,
        from: input.relation.direction === "out" ? from.id : tempId,
        to: input.relation.direction === "out" ? tempId : from.id,
        type: input.relation.type,
        description: input.relation.description,
        orderException: false,
        proposal: false,
      }
    : null;
  const operations: OutlinePatchOperation[] = [];
  for (const [nodeId, orders] of placement.shifts) {
    operations.push({ type: "update_node", nodeId, changes: orders });
  }
  operations.push({ type: "create_node", tempId, value: toCreateInput(created) });
  if (relation) {
    operations.push({
      type: "upsert_relation",
      value: {
        sourceNodeId: relation.from,
        targetNodeId: relation.to,
        type: relation.type,
        description: relation.description,
        orderException: false,
      },
    });
  }
  return {
    document: {
      ...document,
      nodes: [...nodes, created],
      relations: relation ? [...document.relations, relation] : document.relations,
    },
    operations,
  };
}

export function previewProposal(proposal: OutlineProposal): ProposalPreview {
  if (proposal.status === "repairable") {
    return {
      summary: "",
      nodes: [],
      relations: [],
      updatedNodeIds: [],
      problems: proposal.problems.map((problem) => problem.message),
    };
  }
  const nodes: GraphNode[] = [];
  const relations: GraphRelation[] = [];
  const updatedNodeIds: string[] = [];
  for (const operation of proposal.patch.operations) {
    if (operation.type === "create_node") {
      nodes.push(nodeFromInput(operation.tempId, operation.value));
    } else if (operation.type === "upsert_relation") {
      relations.push({
        id: operation.value.id ?? `proposal:${operation.value.type}:${operation.value.sourceNodeId}:${operation.value.targetNodeId}`,
        from: operation.value.sourceNodeId,
        to: operation.value.targetNodeId,
        type: operation.value.type,
        description: operation.value.description,
        orderException: operation.value.orderException,
        proposal: true,
      });
    } else if (operation.type === "update_node") {
      updatedNodeIds.push(operation.nodeId);
    }
  }
  return { summary: proposal.summary, nodes, relations, updatedNodeIds, problems: [] };
}

export function buildProseBrief(
  document: GraphDocument,
  ids: readonly string[],
  chapters: readonly ChapterOption[],
): ProseBrief {
  const blockers: string[] = [];
  if (document.source !== "outline") blockers.push("当前是示例图。先生成并接受一版事件图，再写正文。");
  if (ids.length === 0) blockers.push("先选中要写的节点。");
  const nodes = ids.flatMap((id) => {
    const node = document.nodes.find((item) => item.id === id);
    return node ? [node] : [];
  });
  if (nodes.length !== ids.length) blockers.push("有选中节点不在当前图上。");
  if (nodes.some((node) => !isLeaf(document, node.id))) blockers.push("只有没有子事件的叶子可以写入正文。");
  if (nodes.some((node) => node.status !== "confirmed")) blockers.push("先把要写的节点标成已确认。");
  if (nodes.some((node) => node.chapterId === null)) blockers.push("先把节点映射到章节。");
  const chapterIds = [...new Set(nodes.flatMap((node) => (node.chapterId ? [node.chapterId] : [])))];
  if (chapterIds.length > 1) blockers.push("一次只写入同一章。请按章分开选择。");
  const ready = blockers.length === 0;
  const chapterId = ready ? chapterIds[0] ?? null : null;
  const selected = new Set(ids);
  const ordered = [...nodes].sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id));
  const story = [...nodes].sort((left, right) => left.storyOrder - right.storyOrder || left.id.localeCompare(right.id));
  const internalEdges = [];
  const externalEdges = [];
  for (const relation of document.relations) {
    const fromIn = selected.has(relation.from);
    const toIn = selected.has(relation.to);
    if (!fromIn && !toIn) continue;
    const row = {
      fromTitle: document.nodes.find((node) => node.id === relation.from)?.title ?? relation.from,
      toTitle: document.nodes.find((node) => node.id === relation.to)?.title ?? relation.to,
      type: RELATION_LABEL[relation.type],
      description: relation.description,
    };
    if (fromIn && toIn) internalEdges.push(row);
    else externalEdges.push(row);
  }
  const orderNote = ordered.map((node) => node.id).join("\0") === story.map((node) => node.id).join("\0")
    ? "按叙事序写，故事顺序与叙事顺序一致。"
    : `按叙事序写。故事发生顺序是：${story.map((node) => node.title).join("，")}。`;
  return {
    blockers,
    chapterId,
    chapterLabel: chapterId ? chapters.find((chapter) => chapter.id === chapterId)?.label ?? chapterId : null,
    nodes: ordered.map((node) => ({
      id: node.id,
      title: node.title,
      goal: node.goal,
      conflict: node.conflict,
      outcome: node.outcome,
    })),
    internalEdges,
    externalEdges,
    orderNote,
  };
}

function nextOrders(
  document: GraphDocument,
  from: GraphNode,
  kind: OutlineNodeKind,
  link: NextNodeInput["link"],
): { readonly storyOrder: number; readonly narrativeOrder: number; readonly shifts: ReadonlyMap<string, { readonly storyOrder: number; readonly narrativeOrder: number }> } {
  const shifts = new Map<string, { storyOrder: number; narrativeOrder: number }>();
  const narrativeOrder = from.narrativeOrder + 1;
  let storyOrder = from.storyOrder + 1;
  if (kind !== "arc" && link === "child") {
    const children = document.nodes.filter((node) => node.parentId === from.id && node.kind !== "arc");
    if (children.length > 0) {
      storyOrder = Math.max(...children.map((node) => node.storyOrder)) + 1;
    } else {
      const leaves = document.nodes.filter((node) => node.kind !== "arc");
      storyOrder = leaves.length > 0 ? Math.max(...leaves.map((node) => node.storyOrder)) + 1 : 0;
    }
  }
  for (const node of document.nodes) {
    if ((kind === "arc") !== (node.kind === "arc")) continue;
    const story = node.storyOrder >= storyOrder ? node.storyOrder + 1 : node.storyOrder;
    const narrative = node.narrativeOrder >= narrativeOrder ? node.narrativeOrder + 1 : node.narrativeOrder;
    if (story !== node.storyOrder || narrative !== node.narrativeOrder) {
      shifts.set(node.id, { storyOrder: story, narrativeOrder: narrative });
    }
  }
  return { storyOrder, narrativeOrder, shifts };
}

function nodeFromInput(id: string, value: CreateNodeInput): GraphNode {
  return {
    id,
    title: value.title,
    summary: value.summary,
    kind: value.kind,
    parentId: value.parentId,
    structuralRole: value.structuralRole,
    narrativeFunction: value.narrativeFunction,
    goal: value.goal,
    conflict: value.conflict,
    outcome: value.outcome,
    locationText: value.locationText,
    timeText: value.timeText,
    storyOrder: value.storyOrder,
    narrativeOrder: value.narrativeOrder,
    status: value.status,
    notes: value.notes,
    participants: value.participants.map((participant) => ({
      name: participant.participantName,
      role: participant.role,
      stateBefore: participant.stateBefore,
      stateAfter: participant.stateAfter,
    })),
    chapterId: null,
    proposal: true,
  };
}

function people(value: string): GraphParticipant[] {
  return value
    .split("、")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "无主动参与者")
    .map((name) => ({ name, role: "active" as const, stateBefore: "", stateAfter: "" }));
}

function sampleChapterId(label: string): string | null {
  const match = /第\s*(\d+)\s*章/.exec(label);
  return match?.[1] ?? null;
}
