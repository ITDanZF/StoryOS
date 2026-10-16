import { useMemo, useState } from "react";
import { PageSurface } from "../../components/layout/PageSurface.tsx";
import { Button } from "../../components/ui/Button.tsx";
import EventGraphPanel from "./EventGraphPanel.tsx";
import EventGraphSpine from "./EventGraphSpine.tsx";
import { buildEventGraph, type GraphSelection } from "./model/buildEventGraph.ts";
import type { GraphDocument, GraphNode, GraphRelation } from "./model/document.ts";
import staticStory from "./data/staticStory.json";

type StaticStage = (typeof staticStory.stages)[number];
type StaticEvent = (typeof staticStory.events)[number];

function stageDocument(stage: StaticStage, events: readonly { readonly id: string; readonly title: string; readonly stageId: string; readonly outcome: string }[]): string {
  const members = events.filter((event) => event.stageId === stage.id);
  return [
    `# ${stage.title}`,
    "> 故事阶段 · 由底部大括号标出范围",
    "## 阶段核心",
    `- **进入局面**：${stage.entry}`,
    `- **目标**：${stage.goal}`,
    `- **核心阻力**：${stage.obstacle}`,
    `- **不可逆转折**：${stage.turn}`,
    `- **离开局面**：${stage.exit}`,
    "## 关键事件",
    ...members.map((event) => `- [${event.title}](#event-node:${event.id})：${event.outcome}`),
    "## 作者笔记",
    stage.notes,
  ].join("\n\n");
}

function eventDocument(event: StaticEvent, stages: readonly StaticStage[], events: readonly StaticEvent[], relations: readonly GraphRelation[]): string {
  const stage = stages.find((item) => item.id === event.stageId);
  const connected = relations.filter((item) => item.from === event.id || item.to === event.id);
  const title = (id: string) => events.find((item) => item.id === id)?.title ?? id;
  const relationLabels: Readonly<Record<string, string>> = { causes: "因果", requires: "前置", reveals: "揭示", foreshadows: "伏笔", contrasts: "对照" };
  return [
    `# ${event.title}`,
    `> ${stage?.title ?? "未归入阶段"} · 讲述第 ${event.narrativeOrder + 1} 个事件 · 故事第 ${event.storyOrder + 1} 个事件`,
    event.summary,
    "## 事件核心",
    `- **目标**：${event.goal}`,
    `- **阻力**：${event.conflict}`,
    `- **结果**：${event.outcome}`,
    "## 变化",
    `- **之前**：${event.changeBefore}`,
    `- **之后**：${event.changeAfter}`,
    "## 人物变化",
    ...event.participants.map((person) => `- **${person.name}**（${person.role}）：${person.stateBefore} → ${person.stateAfter}`),
    "## 关系",
    ...(connected.length ? connected.map((item) => {
      const otherId = item.from === event.id ? item.to : item.from;
      return `- **${relationLabels[item.type] ?? item.type} ${item.from === event.id ? "→" : "←"}** [${title(otherId)}](#event-node:${otherId})：${item.description}`;
    }) : ["- 暂无已确认的语义关系。"]),
    "## 写作边界",
    event.writingBoundary,
    "## 作者笔记",
    event.notes,
  ].join("\n\n");
}

function makeDocument(): GraphDocument {
  const relations: GraphRelation[] = staticStory.relations.map((item) => ({ ...item, orderException: false, proposal: false }));
  const stages: GraphNode[] = staticStory.stages.map((stage, index): GraphNode => ({
    id: stage.id, title: stage.title, summary: stage.entry, document: stageDocument(stage, staticStory.events),
    changeBefore: stage.entry, changeAfter: stage.exit, kind: "arc", parentId: null,
    structuralRole: "custom", narrativeFunction: "mixed", storyOrder: index, narrativeOrder: index,
    status: "confirmed", participants: [], chapterId: null, proposal: false,
  }));
  const events: GraphNode[] = staticStory.events.map((event): GraphNode => ({
    id: event.id, title: event.title, summary: event.summary,
    document: eventDocument(event, staticStory.stages, staticStory.events, relations),
    changeBefore: event.changeBefore, changeAfter: event.changeAfter, kind: "event", parentId: event.stageId,
    structuralRole: "custom", narrativeFunction: "mixed", storyOrder: event.storyOrder, narrativeOrder: event.narrativeOrder,
    status: "confirmed", participants: event.participants.map((person) => ({ ...person, kind: "person" })),
    chapterId: null, proposal: false,
  }));
  return { source: "sample", outlineId: null, revision: 1, title: staticStory.title, nodes: [...stages, ...events], relations };
}

export default function EventGraphStaticPreview({ onExit }: { readonly onExit: () => void }) {
  const [document, setDocument] = useState<GraphDocument>(makeDocument);
  const [selection, setSelection] = useState<GraphSelection>(null);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const renderedDocument = useMemo<GraphDocument>(() => {
    const events = document.nodes.filter((node) => node.kind !== "arc").map((node) => ({ id: node.id, title: node.title, stageId: node.parentId ?? "", outcome: node.changeAfter }));
    return { ...document, nodes: document.nodes.map((node) => {
      const stage = staticStory.stages.find((item) => item.id === node.id);
      if (stage) return { ...node, document: stageDocument(stage, events) };
      const event = staticStory.events.find((item) => item.id === node.id);
      return event ? { ...node, document: eventDocument({ ...event, stageId: node.parentId ?? "", storyOrder: node.storyOrder, narrativeOrder: node.narrativeOrder }, staticStory.stages, staticStory.events, document.relations) } : node;
    }) };
  }, [document]);
  const graph = useMemo(() => buildEventGraph(renderedDocument, "all", {}, new Map()), [renderedDocument]);
  const selectedId = selection?.kind === "nodes" ? selection.ids[0] ?? null : null;
  const stageCount = document.nodes.filter((node) => node.kind === "arc").length;
  const eventCount = document.nodes.length - stageCount;
  const createEvent = (parentId: string | null, afterId?: string) => {
    const after = document.nodes.find((item) => item.id === afterId);
    const order = after ? after.narrativeOrder + 1 : Math.max(-1, ...document.nodes.map((item) => item.narrativeOrder)) + 1;
    const id = `demo-${crypto.randomUUID()}`;
    const node: GraphNode = {
      id, title: "新事件", summary: "", document: "# 新事件\n\n## 事件核心\n- **目标**：待定\n- **阻力**：待定\n- **结果**：待定",
      changeBefore: "", changeAfter: "", kind: "event", parentId, structuralRole: "custom", narrativeFunction: "mixed",
      storyOrder: order, narrativeOrder: order, status: "draft", participants: [], chapterId: null, proposal: false,
    };
    setDocument((current) => ({ ...current, nodes: [...current.nodes.map((item) => after && item.narrativeOrder >= order && item.kind !== "arc" ? { ...item, narrativeOrder: item.narrativeOrder + 1 } : item), node] }));
    setSelection({ kind: "nodes", ids: [id] });
  };
  return <PageSurface aria-label="事件图静态示例" className="max-md:overflow-y-auto">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
      <div className="mr-auto min-w-0"><h1 className="m-0 text-sm font-semibold">{staticStory.title} · 事件图</h1><p className="m-0 text-[11px] text-text-secondary">静态 JSON 示例 · {stageCount} 个阶段 · {eventCount} 个事件</p></div>
      <Button size="sm" onClick={() => { try { window.localStorage.removeItem("storyos.event-graph.layout.static-preview"); } catch { /* 当前页面仍可重置数据 */ } setDocument(makeDocument()); setSelection(null); setCanvasVersion((value) => value + 1); }}>重置示例</Button>
      <Button size="sm" onClick={onExit}>返回当前书籍</Button>
    </header>
    <p className="m-0 shrink-0 border-b border-border bg-accent/20 px-4 py-1.5 text-[11px] text-text-secondary">示例数据来自 staticStory.json。节点位置保存在本机；新增和删除只影响当前页面。</p>
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(500px,1fr)_minmax(220px,1fr)] md:grid-cols-[minmax(0,1fr)_360px] md:grid-rows-1">
      <EventGraphSpine
        key={canvasVersion}
        projectId="static-preview"
        nodes={renderedDocument.nodes}
        chapterLabels={new Map()}
        chapter="all"
        selectedId={selectedId}
        relations={renderedDocument.relations}
        onSelect={(id) => setSelection({ kind: "nodes", ids: [id] })}
        onClear={() => setSelection(null)}
        onPlace={(id, orderedIds, parentId) => {
          const order = new Map(orderedIds.map((item, index) => [item, index]));
          setDocument((current) => ({ ...current, nodes: current.nodes.map((item) => item.id === id ? { ...item, parentId, narrativeOrder: order.get(item.id) ?? item.narrativeOrder } : order.has(item.id) ? { ...item, narrativeOrder: order.get(item.id) ?? item.narrativeOrder } : item) }));
        }}
        onInsertAfter={(id) => createEvent(document.nodes.find((item) => item.id === id)?.parentId ?? null, id)}
        onAddEvent={(stageId) => createEvent(stageId)}
        onCreateBlank={() => createEvent(null)}
        onRemove={(id) => { setDocument((current) => ({ ...current, nodes: current.nodes.filter((item) => item.id !== id && item.parentId !== id), relations: current.relations.filter((item) => item.from !== id && item.to !== id) })); setSelection(null); }}
      />
      <EventGraphPanel graph={graph} selection={selection} spine onSelectEdge={(id) => setSelection({ kind: "edge", id })} onOpenNode={(id) => setSelection({ kind: "nodes", ids: [id] })} onClear={() => setSelection(null)} />
    </div>
  </PageSurface>;
}
