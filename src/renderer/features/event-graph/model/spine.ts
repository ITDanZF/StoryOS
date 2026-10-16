import type { OutlineNodeKind, OutlineNodeStatus } from "../../../../shared/contracts/outline/outlineContracts.ts";

export type SpineJump = "倒叙" | "预叙";

export type SpineItem = {
  readonly id: string;
  readonly title: string;
  readonly changeBefore: string;
  readonly changeAfter: string;
  readonly storyOrder: number;
  readonly narrativeOrder: number;
  readonly parentId: string | null;
  readonly chapterId: string | null;
  readonly chapterIds?: readonly string[];
  readonly proposal: boolean;
  readonly kind: OutlineNodeKind;
  readonly summary: string;
  readonly status: OutlineNodeStatus;
  readonly participants: readonly {
    readonly name: string;
    readonly role: string;
    readonly kind: string;
    readonly stateBefore: string;
    readonly stateAfter: string;
  }[];
};

export type SpineLane = {
  readonly arcId: string | null;
  readonly title: string;
};

export type SpineBlock = {
  readonly arcId: string | null;
  readonly arcTitle: string;
  readonly rows: readonly (SpineItem & { readonly reading: number; readonly jump: SpineJump | null })[];
};

export function narrativeJump(previousStory: number | null, story: number): SpineJump | null {
  if (previousStory === null) return null;
  const jump = story - previousStory;
  if (jump < 0) return "倒叙";
  if (jump > 1) return "预叙";
  return null;
}

export function spineBlocks(items: readonly SpineItem[], arcTitles: ReadonlyMap<string, string>): readonly SpineBlock[] {
  const ordered = items
    .slice()
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.storyOrder - right.storyOrder || left.id.localeCompare(right.id));
  const blocks: SpineBlock[] = [];
  let previousStory: number | null = null;
  ordered.forEach((item, index) => {
    const arcId = item.parentId;
    const arcTitle = arcId ? arcTitles.get(arcId) ?? "未命名阶段" : "尚未归入阶段";
    const row = { ...item, reading: index + 1, jump: narrativeJump(previousStory, item.storyOrder) };
    const current = blocks[blocks.length - 1];
    if (!current || current.arcId !== arcId) blocks.push({ arcId, arcTitle, rows: [row] });
    else blocks[blocks.length - 1] = { ...current, rows: [...current.rows, row] };
    previousStory = item.storyOrder;
  });
  return blocks;
}

export function isMainlineCard(node: SpineItem, nodes: readonly SpineItem[]): boolean {
  if (node.kind === "arc") return false;
  const hasChild = nodes.some((child) => child.parentId === node.id);
  if (hasChild) return false;
  return node.kind === "event" || node.kind === "scene" || node.kind === "beat";
}

export function ancestorArcId(id: string, nodes: readonly SpineItem[]): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current) {
    if (current.kind === "arc") return current.id;
    if (!current.parentId || seen.has(current.id)) return null;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return null;
}

export function spineLanes(nodes: readonly SpineItem[]): readonly SpineLane[] {
  const arcs = nodes
    .filter((node) => node.kind === "arc")
    .slice()
    .sort((left, right) => left.storyOrder - right.storyOrder || left.id.localeCompare(right.id));
  const lanes: SpineLane[] = arcs.map((arc) => ({ arcId: arc.id, title: arc.title }));
  const cards = nodes.filter((node) => isMainlineCard(node, nodes));
  if (cards.some((card) => ancestorArcId(card.id, nodes) === null)) lanes.push({ arcId: null, title: "尚未归入阶段" });
  return lanes;
}

export function moveSpineItem(ids: readonly string[], fromId: string, toId: string): readonly string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  if (!item) return ids;
  next.splice(to, 0, item);
  return next;
}
