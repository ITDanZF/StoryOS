import {
  OUTLINE_NARRATIVE_FUNCTIONS,
  OUTLINE_PARTICIPANT_ROLES,
  OUTLINE_RELATION_TYPES,
  OUTLINE_STRUCTURAL_ROLES,
  type CreateNodeInput,
  type OutlineNodeKind,
  type OutlineNodeStatus,
  type OutlinePatchOperation,
  type OutlineProposal,
  type OutlineSnapshot,
  type UpdateNodeInput,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import {
  parseStoryDocument,
  relationLabel,
  renderStoryDocument,
  replaceRelationSection,
  type StoryDocumentIssue,
  type StoryRelationRef,
} from "./storyDocument.ts";
import { STORY_ARCS, STORY_LEAVES, STORY_RELATIONS } from "./sampleStory.ts";

export const SAMPLE_CHAPTERS = [
  { id: "1", label: "第1章" },
  { id: "2", label: "第2章" },
  { id: "3", label: "第3章" },
] as const;

const ARC_ORDER = ["E5", "E2", "E1", "E3", "E4"] as const;

export const RELATION_LABEL: Readonly<Record<string, string>> = {
  causes: "因果",
  requires: "前置",
  enables: "使可能",
  prevents: "阻止",
  reveals: "揭示",
  conceals: "隐瞒",
  foreshadows: "伏笔",
  contrasts: "对照",
  accompanies: "伴随",
};

export { relationLabel };

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
  readonly currentRevisionId?: string | null;
};

export type GraphParticipant = {
  readonly name: string;
  readonly role: string;
  readonly kind: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
};

export type GraphNode = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly document: string;
  readonly changeBefore: string;
  readonly changeAfter: string;
  readonly kind: OutlineNodeKind;
  readonly parentId: string | null;
  readonly structuralRole: string;
  readonly narrativeFunction: string;
  readonly storyOrder: number;
  readonly narrativeOrder: number;
  readonly status: OutlineNodeStatus;
  readonly participants: readonly GraphParticipant[];
  readonly chapterId: string | null;
  readonly proposal: boolean;
};

export type GraphRelation = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: string;
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
  readonly participants: readonly GraphParticipant[];
  readonly link: "child" | "sibling";
  readonly relation: {
    readonly type: string;
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
  readonly nodes: readonly { readonly id: string; readonly title: string; readonly changeBefore: string; readonly changeAfter: string }[];
  readonly internalEdges: readonly { readonly fromTitle: string; readonly toTitle: string; readonly type: string; readonly description: string }[];
  readonly externalEdges: readonly { readonly fromTitle: string; readonly toTitle: string; readonly type: string; readonly description: string }[];
  readonly orderNote: string;
};

export function emptyDocument(title = ""): GraphDocument {
  return {
    source: "outline",
    outlineId: null,
    revision: 0,
    title,
    nodes: [],
    relations: [],
  };
}

export function sampleDocument(): GraphDocument {
  const relations: GraphRelation[] = STORY_RELATIONS.map((relation) => ({
    id: `${relation.type}:${relation.from}:${relation.to}`,
    from: relation.from,
    to: relation.to,
    type: relation.type,
    description: relation.detail,
    orderException: false,
    proposal: false,
  }));
  const arcs: GraphNode[] = STORY_ARCS.map((arc): GraphNode => sampleNode({
    id: arc.id,
    title: arc.name,
    kind: "arc",
    parentId: null,
    lead: sampleLead(arc.goal, arc.conflict, arc.timeText),
    changeAfter: arc.outcome,
    participants: sampleParticipants(arc.people, arc.locationText),
    storyOrder: ARC_ORDER.indexOf(arc.id as (typeof ARC_ORDER)[number]),
    narrativeOrder: ARC_ORDER.indexOf(arc.id as (typeof ARC_ORDER)[number]),
    chapterId: null,
  }));
  const leaves: GraphNode[] = STORY_LEAVES.map((leaf): GraphNode => sampleNode({
    id: leaf.id,
    title: leaf.name,
    kind: "event",
    parentId: leaf.parent,
    lead: sampleLead(leaf.goal, leaf.conflict, leaf.timeText),
    changeAfter: leaf.outcome,
    participants: sampleParticipants(leaf.people, leaf.locationText),
    storyOrder: leaf.story,
    narrativeOrder: leaf.narrative,
    chapterId: sampleChapterId(leaf.chapter),
  }));
  return {
    source: "sample",
    outlineId: null,
    revision: 0,
    title: "沈衡与梁秋",
    nodes: projectRelationSections([...arcs, ...leaves], relations),
    relations,
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
      kind: "人",
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
    nodes: projectRelationSections(snapshot.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary,
      document: "",
      changeBefore: "",
      changeAfter: node.outcome,
      kind: node.kind,
      parentId: node.parentId,
      structuralRole: node.structuralRole,
      narrativeFunction: node.narrativeFunction,
      storyOrder: node.storyOrder,
      narrativeOrder: node.narrativeOrder,
      status: node.status,
      participants: placeParticipant(grouped.get(node.id) ?? [], node.locationText),
      chapterId: chapterOf.get(node.id) ?? null,
      proposal: false,
    })), snapshot.relations.map((relation) => ({
      id: relation.id,
      from: relation.sourceNodeId,
      to: relation.targetNodeId,
      type: relation.type,
      description: relation.description,
      orderException: relation.orderException,
      proposal: false,
    }))),
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
  const place = node.participants.find((participant) => participant.role === "场所" || participant.kind === "地点");
  return {
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    structuralRole: knownValue(OUTLINE_STRUCTURAL_ROLES, node.structuralRole, "custom"),
    narrativeFunction: knownValue(OUTLINE_NARRATIVE_FUNCTIONS, node.narrativeFunction, "mixed"),
    goal: "",
    conflict: "",
    outcome: node.changeAfter,
    locationText: place?.name ?? "",
    timeText: "",
    storyOrder: node.storyOrder,
    narrativeOrder: node.narrativeOrder,
    status: node.status,
    notes: "",
    participants: node.participants
      .filter((participant) => participant !== place)
      .map((participant) => ({
        participantName: participant.name,
        role: knownValue(OUTLINE_PARTICIPANT_ROLES, participant.role, "active"),
        stateBefore: participant.stateBefore,
        stateAfter: participant.stateAfter,
      })),
  };
}

export function toUpdateInput(node: GraphNode): UpdateNodeInput {
  const input = toCreateInput(node);
  return {
    title: input.title,
    summary: input.summary,
    outcome: input.outcome,
    locationText: input.locationText,
    participants: input.participants,
  };
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
  const participants = input.participants.filter((participant) => participant.name.trim() !== "");
  const created: GraphNode = {
    id: tempId,
    title: input.title.trim(),
    summary: input.summary,
    document: renderStoryDocument({ title: input.title.trim(), lead: input.summary, participants }),
    changeBefore: "",
    changeAfter: "",
    kind,
    parentId,
    structuralRole: "",
    narrativeFunction: "",
    storyOrder: placement.storyOrder,
    narrativeOrder: placement.narrativeOrder,
    status: "draft",
    participants,
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
  const nextRelations = relation ? [...document.relations, relation] : document.relations;
  const nextNodes = projectRelationSections([...nodes, created], nextRelations);
  const createdNode = nextNodes.find((node) => node.id === tempId) ?? created;
  const operations: OutlinePatchOperation[] = [];
  for (const [nodeId, orders] of placement.shifts) {
    operations.push({ type: "update_node", nodeId, changes: orders });
  }
  operations.push({ type: "create_node", tempId, value: toCreateInput(createdNode) });
  const relationType = relation ? knownValueOrNull(OUTLINE_RELATION_TYPES, relation.type) : null;
  if (relation && relationType) {
    operations.push({
      type: "upsert_relation",
      value: {
        sourceNodeId: relation.from,
        targetNodeId: relation.to,
        type: relationType,
        description: relation.description,
        orderException: false,
      },
    });
  }
  return {
    document: { ...document, nodes: nextNodes, relations: nextRelations },
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
      type: relationLabel(relation.type),
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
      changeBefore: node.changeBefore,
      changeAfter: node.changeAfter,
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

export function applyNodeDocument(
  document: GraphDocument,
  nodeId: string,
  markdown: string,
): { readonly document: GraphDocument; readonly issues: readonly StoryDocumentIssue[] } {
  const node = document.nodes.find((item) => item.id === nodeId);
  if (!node) return { document, issues: [{ message: "引用不存在", blocking: true }] };
  const parsed = parseStoryDocument(markdown);
  if (parsed.issues.some((issue) => issue.blocking)) return { document, issues: parsed.issues };
  const title = parsed.title ?? node.title;
  const issues = [...parsed.issues];
  if (parsed.title === null) issues.push({ message: "文档缺少标题，标题保持不变", blocking: false });
  if (document.nodes.some((item) => item.id !== nodeId && item.title === title)) {
    return { document, issues: [...issues, { message: "标题与另一个节点重复", blocking: true }] };
  }
  const resolved: GraphRelation[] = [];
  for (const relation of parsed.relations) {
    if (relation.otherTitle === title) {
      issues.push({ message: "关系不能指向自己", blocking: false });
      continue;
    }
    const matches = document.nodes.filter((item) => item.id !== nodeId && item.title === relation.otherTitle);
    const other = matches[0];
    if (!other || matches.length !== 1) {
      issues.push({
        message: matches.length > 1 ? `「${relation.otherTitle}」对应多个节点` : `找不到「${relation.otherTitle}」`,
        blocking: false,
      });
      continue;
    }
    const from = relation.direction === "out" ? nodeId : other.id;
    const to = relation.direction === "out" ? other.id : nodeId;
    const key = `${relation.type}\u001f${from}\u001f${to}`;
    if (resolved.some((item) => `${item.type}\u001f${item.from}\u001f${item.to}` === key)) continue;
    const existing = document.relations.find((item) => item.type === relation.type && item.from === from && item.to === to);
    resolved.push({
      id: existing?.id ?? `rel:${relation.type}:${from}:${to}`,
      from,
      to,
      type: relation.type,
      description: relation.description,
      orderException: existing?.orderException ?? false,
      proposal: false,
    });
  }
  const relations = [...document.relations.filter((relation) => relation.from !== nodeId && relation.to !== nodeId), ...resolved];
  let nodes = document.nodes.map((item) => item.id === nodeId
    ? {
        ...item,
        title,
        summary: parsed.lead,
        document: markdown,
        changeBefore: parsed.changeBefore,
        changeAfter: parsed.changeAfter,
        participants: parsed.participants.map((participant) => ({ ...participant })),
      }
    : item.document.includes(`[[${node.title}]]`) && title !== node.title
      ? { ...item, document: item.document.split(`[[${node.title}]]`).join(`[[${title}]]`) }
      : item);
  nodes = projectRelationSections(nodes, relations, new Set([nodeId]));
  return { document: { ...document, nodes, relations }, issues };
}

function nodeFromInput(id: string, value: CreateNodeInput): GraphNode {
  const participants = placeParticipant(value.participants.map((participant) => ({
    name: participant.participantName,
    kind: "人",
    role: participant.role,
    stateBefore: participant.stateBefore,
    stateAfter: participant.stateAfter,
  })), value.locationText);
  const lead = value.summary;
  return {
    id,
    title: value.title,
    summary: lead,
    document: renderStoryDocument({
      title: value.title,
      lead,
      changeAfter: value.outcome,
      participants,
    }),
    changeBefore: "",
    changeAfter: value.outcome,
    kind: value.kind,
    parentId: value.parentId,
    structuralRole: value.structuralRole,
    narrativeFunction: value.narrativeFunction,
    storyOrder: value.storyOrder,
    narrativeOrder: value.narrativeOrder,
    status: value.status,
    participants,
    chapterId: null,
    proposal: true,
  };
}

function placeParticipant(participants: readonly GraphParticipant[], location: string): GraphParticipant[] {
  const place = location.trim();
  if (place === "" || participants.some((participant) => participant.name === place)) return [...participants];
  return [...participants, { name: place, role: "场所", kind: "地点", stateBefore: "", stateAfter: "" }];
}

function knownValue<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

function knownValueOrNull<T extends string>(allowed: readonly T[], value: string): T | null {
  return allowed.find((item) => item === value) ?? null;
}

function sampleNode(input: {
  readonly id: string;
  readonly title: string;
  readonly kind: OutlineNodeKind;
  readonly parentId: string | null;
  readonly lead: string;
  readonly changeAfter: string;
  readonly participants: readonly GraphParticipant[];
  readonly storyOrder: number;
  readonly narrativeOrder: number;
  readonly chapterId: string | null;
}): GraphNode {
  return {
    id: input.id,
    title: input.title,
    summary: input.lead,
    document: "",
    changeBefore: "",
    changeAfter: input.changeAfter,
    kind: input.kind,
    parentId: input.parentId,
    structuralRole: "",
    narrativeFunction: "",
    storyOrder: input.storyOrder,
    narrativeOrder: input.narrativeOrder,
    status: "draft",
    participants: input.participants,
    chapterId: input.chapterId,
    proposal: false,
  };
}

function sampleLead(goal: string, conflict: string, timeText: string): string {
  return [goal.trim(), conflict.trim(), timeText.trim() === "" ? "" : `时间：${timeText.trim()}`].filter((line) => line !== "").join("\n\n");
}

function sampleParticipants(people: string, location: string): GraphParticipant[] {
  const participants = people
    .split("、")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "无主动参与者")
    .map((name) => ({ name, role: "施事", kind: "人", stateBefore: "", stateAfter: "" }));
  const place = location.trim();
  if (place === "" || participants.some((participant) => participant.name === place)) return participants;
  return [...participants, { name: place, role: "场所", kind: "地点", stateBefore: "", stateAfter: "" }];
}

function projectRelationSections(
  nodes: readonly GraphNode[],
  relations: readonly GraphRelation[],
  skip: ReadonlySet<string> = new Set(),
): GraphNode[] {
  const titles = new Map(nodes.map((node) => [node.id, node.title]));
  return nodes.map((node) => {
    const refs: StoryRelationRef[] = relations.flatMap((relation): StoryRelationRef[] => {
      if (relation.from === node.id) {
        return [{ type: relation.type, direction: "out" as const, otherTitle: titles.get(relation.to) ?? relation.to, description: relation.description }];
      }
      if (relation.to === node.id) {
        return [{ type: relation.type, direction: "in" as const, otherTitle: titles.get(relation.from) ?? relation.from, description: relation.description }];
      }
      return [];
    });
    if (skip.has(node.id)) return node;
    if (node.document.trim() === "") {
      return {
        ...node,
        document: renderStoryDocument({
          title: node.title,
          lead: node.summary,
          changeBefore: node.changeBefore,
          changeAfter: node.changeAfter,
          participants: node.participants,
          relations: refs,
        }),
      };
    }
    return { ...node, document: replaceRelationSection(node.document, refs) };
  });
}

function sampleChapterId(label: string): string | null {
  const match = /第\s*(\d+)\s*章/.exec(label);
  return match?.[1] ?? null;
}
