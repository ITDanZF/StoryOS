import { RELATION_LABEL, type GraphDocument, type GraphNode, type ProposalPreview } from "./document.ts";

export const GRAPH_VIEWS = [
  ["arc", "故事弧"],
  ["story", "故事序"],
  ["narrative", "叙事序"],
  ["plot", "情节关系"],
] as const;

export type GraphView = (typeof GRAPH_VIEWS)[number][0];
export type Emphasis = "main" | "ghost" | "focus";

export type GraphSelection =
  | { readonly kind: "nodes"; readonly ids: readonly string[] }
  | { readonly kind: "edge"; readonly id: string }
  | null;

export type GraphVertex = {
  readonly id: string;
  readonly name: string;
  readonly kind: "arc" | "leaf";
  readonly parent?: string;
  readonly story?: number;
  readonly narrative?: number;
  readonly chapter?: string;
  readonly chapterId: string | null;
  readonly timeText: string;
  readonly locationText: string;
  readonly people: string;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly y: number;
  readonly dim: boolean;
  readonly transition: boolean;
  readonly proposal: boolean;
  readonly pending: boolean;
};

export type GraphEdge = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly label: string;
  readonly detail?: string;
};

export type EventGraph = {
  readonly vertices: readonly GraphVertex[];
  readonly edges: readonly GraphEdge[];
  readonly width: number;
  readonly height: number;
};

export type DrawEdge = {
  readonly id: string;
  readonly d: string;
  readonly label: string | null;
  readonly labelX: number;
  readonly labelY: number;
  readonly color: string;
  readonly dashed: boolean;
  readonly opacity: number;
  readonly width: number;
  readonly emphasis: Emphasis;
};

const CX = 560;
const CY = 500;
const RADIUS = 248;
const VERTEX = 80;

export const EDGE_TYPE_NAME: Readonly<Record<string, string>> = {
  contains: "包含",
  story: "故事序",
  narrative: "叙事序",
  ...RELATION_LABEL,
};

const EDGE_COLOR: Readonly<Record<string, string>> = {
  contains: "#c5c5bf",
  story: "#7d8b99",
  narrative: "#6c4ae0",
  causes: "#a96620",
  requires: "#5c6b7a",
  reveals: "#2f6f9f",
  foreshadows: "#6c4ae0",
  contrasts: "#9f3b32",
};

export function edgeFamily(edge: GraphEdge): string {
  if (edge.type === "contains" || edge.type === "story" || edge.type === "narrative") return edge.type;
  return "relations";
}

export function arcIdsOf(graph: EventGraph): ReadonlySet<string> {
  return new Set(graph.vertices.filter((vertex) => vertex.kind === "arc").map((vertex) => vertex.id));
}

export function inViewEdge(view: GraphView, edge: GraphEdge, arcs: ReadonlySet<string>): boolean {
  if (view === "arc") return edge.type === "story" && arcs.has(edge.from) && arcs.has(edge.to);
  if (view === "story") return edge.type === "story" && !arcs.has(edge.from);
  if (view === "narrative") return edge.type === "narrative" || edge.type === "causes";
  return edgeFamily(edge) === "relations";
}

export function buildEventGraph(
  document: GraphDocument,
  chapter: string,
  dragged: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
  chapterLabels: ReadonlyMap<string, string>,
  preview?: ProposalPreview | null,
): EventGraph {
  const pending = new Set(preview?.updatedNodeIds ?? []);
  const nodes = [...document.nodes, ...(preview?.nodes ?? [])];
  const leaves = placeLeaves(nodes.filter((node) => node.kind !== "arc"), dragged, chapterLabels, pending);
  const arcs = placeArcs(nodes.filter((node) => node.kind === "arc"), leaves, dragged, chapterLabels, pending);
  const vertices: GraphVertex[] = [...arcs, ...leaves];
  const edges: GraphEdge[] = [];
  for (const leaf of leaves) {
    if (!leaf.parent) continue;
    edges.push({ id: `contains:${leaf.parent}:${leaf.id}`, from: leaf.parent, to: leaf.id, type: "contains", label: "包含" });
  }
  const ordered = leaves.slice().sort((left, right) => (left.story ?? 0) - (right.story ?? 0) || left.id.localeCompare(right.id));
  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1];
    const to = ordered[index];
    if (!from || !to) continue;
    edges.push({ id: `story:${from.id}:${to.id}`, from: from.id, to: to.id, type: "story", label: "故事序" });
  }
  const arcOrder = arcs.slice().sort((left, right) => (left.story ?? 0) - (right.story ?? 0) || left.id.localeCompare(right.id));
  for (let index = 1; index < arcOrder.length; index += 1) {
    const from = arcOrder[index - 1];
    const to = arcOrder[index];
    if (!from || !to) continue;
    edges.push({ id: `story:${from.id}:${to.id}`, from: from.id, to: to.id, type: "story", label: "故事序" });
  }
  const reading = leaves.slice().sort((left, right) => (left.narrative ?? 0) - (right.narrative ?? 0) || left.id.localeCompare(right.id));
  for (let index = 1; index < reading.length; index += 1) {
    const from = reading[index - 1];
    const to = reading[index];
    if (!from || !to) continue;
    const jump = (to.story ?? 0) - (from.story ?? 0);
    edges.push({
      id: `narrative:${from.id}:${to.id}`,
      from: from.id,
      to: to.id,
      type: "narrative",
      label: jump < 0 ? "倒叙" : jump > 1 ? "预叙" : "叙事序",
    });
  }
  for (const relation of [...document.relations, ...(preview?.relations ?? [])]) {
    edges.push({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      type: relation.type,
      label: EDGE_TYPE_NAME[relation.type] ?? relation.type,
      detail: relation.description,
    });
  }
  applyChapter(vertices, reading, chapter);
  const bounds = vertices.reduce((box, vertex) => ({
    minX: Math.min(box.minX, vertex.x),
    minY: Math.min(box.minY, vertex.y),
    maxX: Math.max(box.maxX, vertex.x + vertex.w),
    maxY: Math.max(box.maxY, vertex.y + vertex.h),
  }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
  const width = Number.isFinite(bounds.minX) ? bounds.maxX + 120 : 720;
  const height = Number.isFinite(bounds.minY) ? bounds.maxY + 140 : 640;
  return { vertices, edges, width, height };
}

function placeLeaves(
  nodes: readonly GraphNode[],
  dragged: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
  chapterLabels: ReadonlyMap<string, string>,
  pending: ReadonlySet<string>,
) {
  const ordered = nodes.slice().sort((left, right) => left.storyOrder - right.storyOrder || left.id.localeCompare(right.id));
  return ordered.map((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(ordered.length, 1)) * Math.PI * 2;
    const home = dragged[node.id] ?? {
      x: CX + RADIUS * Math.cos(angle) - VERTEX / 2,
      y: CY + RADIUS * Math.sin(angle) - VERTEX / 2,
    };
    return { ...toVertex(node, home, chapterLabels, pending), angle, parent: node.parentId ?? undefined };
  });
}

function placeArcs(
  nodes: readonly GraphNode[],
  leaves: readonly (GraphVertex & { readonly angle: number })[],
  dragged: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
  chapterLabels: ReadonlyMap<string, string>,
  pending: ReadonlySet<string>,
): GraphVertex[] {
  const ranked = nodes.slice().sort((left, right) => left.storyOrder - right.storyOrder || left.id.localeCompare(right.id));
  return ranked.map((node, index) => {
    const kids = leaves.filter((leaf) => leaf.parent === node.id);
    const mid = kids.length > 0
      ? kids.reduce((sum, leaf) => sum + leaf.angle, 0) / kids.length
      : -Math.PI / 2 + (index / Math.max(ranked.length, 1)) * Math.PI * 2;
    const home = dragged[node.id] ?? {
      x: CX + (RADIUS + 118) * Math.cos(mid) - VERTEX / 2,
      y: CY + (RADIUS + 118) * Math.sin(mid) - VERTEX / 2,
    };
    return toVertex(node, home, chapterLabels, pending);
  });
}

function toVertex(
  node: GraphNode,
  home: { readonly x: number; readonly y: number },
  chapterLabels: ReadonlyMap<string, string>,
  pending: ReadonlySet<string>,
): GraphVertex {
  const names = node.participants.map((participant) => participant.name).filter((name) => name.trim() !== "");
  return {
    id: node.id,
    name: node.title,
    kind: node.kind === "arc" ? "arc" : "leaf",
    parent: node.parentId ?? undefined,
    story: node.storyOrder,
    narrative: node.narrativeOrder,
    chapter: node.chapterId ? chapterLabels.get(node.chapterId) ?? "" : "",
    chapterId: node.chapterId,
    timeText: node.timeText,
    locationText: node.locationText,
    people: names.length > 0 ? names.join("、") : "无",
    goal: node.goal,
    conflict: node.conflict,
    outcome: node.outcome,
    w: VERTEX,
    h: VERTEX,
    x: home.x,
    y: home.y,
    dim: false,
    transition: false,
    proposal: node.proposal,
    pending: pending.has(node.id),
  };
}

function applyChapter(vertices: GraphVertex[], reading: readonly GraphVertex[], chapter: string): void {
  if (chapter === "all") return;
  const mine = reading.filter((vertex) => vertex.chapterId === chapter);
  const last = mine[mine.length - 1];
  const next = last ? reading[reading.indexOf(last) + 1] : undefined;
  const ids = new Set(mine.map((vertex) => vertex.id));
  mine.forEach((vertex) => {
    if (vertex.parent) ids.add(vertex.parent);
  });
  if (next) ids.add(next.id);
  vertices.forEach((vertex, index) => {
    vertices[index] = {
      ...vertex,
      dim: !ids.has(vertex.id),
      transition: next?.id === vertex.id,
    };
  });
}

function focusIds(graph: EventGraph, selection: GraphSelection): ReadonlySet<string> {
  if (!selection) return new Set();
  if (selection.kind === "edge") {
    const edge = graph.edges.find((item) => item.id === selection.id);
    return new Set(edge ? [edge.from, edge.to] : []);
  }
  const ids = new Set<string>(selection.ids);
  const only = selection.ids.length === 1 ? selection.ids[0] : undefined;
  if (only) {
    graph.edges.forEach((edge) => {
      if (edge.from === only) ids.add(edge.to);
      if (edge.to === only) ids.add(edge.from);
    });
  }
  return ids;
}

export function vertexEmphasis(graph: EventGraph, view: GraphView, selection: GraphSelection, vertex: GraphVertex): Emphasis {
  if (focusIds(graph, selection).has(vertex.id)) return "focus";
  if (selection) return "ghost";
  if (vertex.dim) return "ghost";
  const main = view === "arc" ? vertex.kind === "arc" : vertex.kind === "leaf";
  return main ? "main" : "ghost";
}

export function edgeEmphasis(graph: EventGraph, view: GraphView, selection: GraphSelection, edge: GraphEdge): Emphasis {
  const selected = new Set(selection?.kind === "nodes" ? selection.ids : []);
  const incident = selection?.kind === "nodes" && (
    selection.ids.length === 1
      ? selected.has(edge.from) || selected.has(edge.to)
      : selected.has(edge.from) && selected.has(edge.to)
  );
  const chosen = selection?.kind === "edge" && edge.id === selection.id;
  if (incident || chosen) return "focus";
  if (selection) return "ghost";
  const from = graph.vertices.find((vertex) => vertex.id === edge.from);
  const to = graph.vertices.find((vertex) => vertex.id === edge.to);
  if (from?.dim || to?.dim) return "ghost";
  return inViewEdge(view, edge, arcIdsOf(graph)) ? "main" : "ghost";
}

function center(vertex: GraphVertex): { x: number; y: number } {
  return { x: vertex.x + vertex.w / 2, y: vertex.y + vertex.h / 2 };
}

function ports(a: GraphVertex, b: GraphVertex, offset: number) {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * offset;
  const oy = (dx / len) * offset;
  return {
    x1: ca.x + (dx / len) * (a.w / 2 + 2) + ox,
    y1: ca.y + (dy / len) * (a.h / 2 + 2) + oy,
    x2: cb.x - (dx / len) * (b.w / 2 + 9) + ox,
    y2: cb.y - (dy / len) * (b.h / 2 + 9) + oy,
  };
}

function geometry(edge: GraphEdge, vertices: ReadonlyMap<string, GraphVertex>) {
  const a = vertices.get(edge.from);
  const b = vertices.get(edge.to);
  if (!a || !b) return null;
  const neighbor = edge.type === "narrative" && a.story != null && b.story != null && Math.abs(a.story - b.story) === 1;
  if (edge.type === "contains" || edge.type === "story" || neighbor) {
    const line = ports(a, b, neighbor ? 12 : 0);
    return { d: `M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`, lx: (line.x1 + line.x2) / 2, ly: (line.y1 + line.y2) / 2 };
  }
  const line = ports(a, b, 0);
  const mx = (line.x1 + line.x2) / 2;
  const my = (line.y1 + line.y2) / 2;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy) || 1;
  const amount = 56 + Math.min(Math.abs((a.story ?? 0) - (b.story ?? 0)), 8) * 12;
  const c1 = { x: mx + (-dy / len) * amount, y: my + (dx / len) * amount };
  const c2 = { x: mx - (-dy / len) * amount, y: my - (dx / len) * amount };
  const outside = Math.hypot(c1.x - CX, c1.y - CY) >= Math.hypot(c2.x - CX, c2.y - CY) ? c1 : c2;
  return {
    d: `M ${line.x1} ${line.y1} Q ${outside.x} ${outside.y} ${line.x2} ${line.y2}`,
    lx: 0.25 * line.x1 + 0.5 * outside.x + 0.25 * line.x2,
    ly: 0.25 * line.y1 + 0.5 * outside.y + 0.25 * line.y2,
  };
}

function labelFor(view: GraphView, edge: GraphEdge, emphasis: Emphasis): string | null {
  if (emphasis === "ghost" || edge.type === "contains") return null;
  if (emphasis === "focus") return edge.label === "叙事序" ? null : edge.label;
  if (edge.label === "倒叙" || edge.label === "预叙" || edgeFamily(edge) === "relations") return edge.label;
  if (view === "arc" && edge.type === "story") return edge.label;
  return null;
}

export function drawEdges(graph: EventGraph, view: GraphView, selection: GraphSelection): DrawEdge[] {
  const vertices = new Map(graph.vertices.map((vertex) => [vertex.id, vertex]));
  return graph.edges.flatMap((edge) => {
    const path = geometry(edge, vertices);
    if (!path) return [];
    const emphasis = edgeEmphasis(graph, view, selection, edge);
    const color = edge.label === "倒叙" ? "#a96620" : (EDGE_COLOR[edge.type] ?? "#7d8b99");
    return [{
      id: edge.id,
      d: path.d,
      label: labelFor(view, edge, emphasis),
      labelX: path.lx,
      labelY: path.ly,
      color,
      dashed: edge.type === "foreshadows",
      opacity: emphasis === "ghost" ? 0.08 : 1,
      width: emphasis === "focus" ? 2.25 : 1.45,
      emphasis,
    }];
  }).sort((a, b) => (a.emphasis === "ghost" ? 0 : 1) - (b.emphasis === "ghost" ? 0 : 1));
}

export const VIEW_LEGEND: Readonly<Record<GraphView, readonly { readonly color: string; readonly label: string; readonly dashed?: boolean }[]>> = {
  arc: [{ color: EDGE_COLOR.story ?? "#7d8b99", label: "故事序" }],
  story: [{ color: EDGE_COLOR.story ?? "#7d8b99", label: "故事序" }],
  narrative: [
    { color: EDGE_COLOR.narrative ?? "#6c4ae0", label: "叙事序" },
    { color: EDGE_COLOR.causes ?? "#a96620", label: "因果" },
  ],
  plot: [
    { color: EDGE_COLOR.causes ?? "#a96620", label: "因果" },
    { color: EDGE_COLOR.requires ?? "#5c6b7a", label: "前置" },
    { color: EDGE_COLOR.reveals ?? "#2f6f9f", label: "揭示" },
    { color: EDGE_COLOR.foreshadows ?? "#6c4ae0", label: "伏笔", dashed: true },
    { color: EDGE_COLOR.contrasts ?? "#9f3b32", label: "对照" },
  ],
};
