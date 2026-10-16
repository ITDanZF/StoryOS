import type { ReactNode } from "react";
import type { NodeBackfillEvidence, OutlinePlanningField } from "../../../shared/contracts/outline/outlineContracts.ts";
import EventGraphMarkdownPanel from "./EventGraphMarkdownPanel.tsx";

export type OutlineFacts = {
  readonly title: string;
  readonly summary: string;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly locationText: string;
  readonly timeText: string;
  readonly statusLabel: string;
  readonly events: readonly { readonly id: string; readonly title: string; readonly outcome: string }[];
  readonly chapterMappings: readonly { readonly chapterId: string; readonly chapterLabel: string; readonly segmentIntent: string; readonly expectedLocalChange: string; readonly coverageLabel: string }[];
  readonly evidence: readonly NodeBackfillEvidence[];
};
import type { StoryDocumentIssue } from "./model/storyDocument.ts";
import { EDGE_TYPE_NAME, type EventGraph, type GraphEdge, type GraphSelection } from "./model/buildEventGraph.ts";
import { cn } from "../../../lib/utils.ts";
// 故事弧、故事序、叙事序、情节关系的边目录暂时隐藏。
// 恢复圆图时接回 GRAPH_VIEWS、arcIdsOf、inViewEdge。

type EventGraphPanelProps = {
  readonly projectId?: string;
  readonly graph: EventGraph;
  readonly selection: GraphSelection;
  readonly spine: boolean;
  readonly issues?: readonly StoryDocumentIssue[];
  readonly onDocument?: (id: string, markdown: string) => void;
  readonly onStoryOrder?: (id: string, storyOrder: number) => void;
  readonly onSelectEdge: (id: string) => void;
  readonly onClear: () => void;
  readonly banner?: ReactNode;
  readonly idle?: ReactNode;
  readonly facts?: OutlineFacts | null;
  readonly onSaveFact?: (id: string, field: "title" | "summary" | "goal" | "conflict" | "outcome" | "locationText" | "timeText", value: string) => void;
  readonly onPlanField?: (id: string, field: OutlinePlanningField) => void;
  readonly onPlanRelation?: (sourceNodeId: string, targetNodeId: string) => void;
  readonly onEditMapping?: (nodeId: string) => void;
  readonly onGenerateNode?: (nodeId: string) => void;
  readonly onOpenNode?: (id: string) => void;
};

export default function EventGraphPanel({ projectId, graph, selection, spine, issues = [], onDocument, onStoryOrder, onSelectEdge, onClear, banner, idle, facts = null, onSaveFact, onPlanField, onPlanRelation, onEditMapping, onGenerateNode, onOpenNode }: EventGraphPanelProps) {
  if (spine) return <EventGraphMarkdownPanel projectId={projectId} graph={graph} selection={selection} issues={issues} facts={facts} banner={banner} idle={idle} onDocument={onDocument} onStoryOrder={onStoryOrder} onSaveFact={onSaveFact} onPlanField={onPlanField} onPlanRelation={onPlanRelation} onEditMapping={onEditMapping} onGenerateNode={onGenerateNode} onOpenNode={onOpenNode} onClear={onClear} />;
  const vertex = selection?.kind === "nodes"
    ? graph.vertices.find((item) => item.id === selection.ids[0])
    : undefined;
  const edge = selection?.kind === "edge" ? graph.edges.find((item) => item.id === selection.id) : undefined;

  return (
    <aside className="min-h-0 overflow-auto border-t border-border bg-card lg:border-l lg:border-t-0" aria-label="事件">
      {banner}
      <div className="px-4 py-4">
      {vertex && <VertexDetail vertex={vertex} graph={graph} spine={spine} issues={issues} facts={vertex.proposal ? null : facts} onDocument={onDocument} onStoryOrder={onStoryOrder} onSaveFact={onSaveFact} onOpenNode={onOpenNode} onSelectEdge={onSelectEdge} onClear={onClear} />}
      {edge && <EdgeDetail edge={edge} graph={graph} onClear={onClear} />}
      {!vertex && !edge && spine && (idle ?? (
        <div>
          <p className="m-0 text-[11px] font-semibold text-text-subtle">事件图</p>
          <h2 className="m-0 text-lg font-semibold">全书主线</h2>
          <p className="text-[13px] leading-6 text-text-secondary">横轴是读者读到的顺序，每一行是一个阶段。拖动卡片可以改顺序。</p>
          <p className="mt-3 flex gap-3 text-[12px] tabular-nums text-muted-foreground">
            <span>|V| {graph.vertices.length}</span>
            <span>|E| {graph.edges.length}</span>
          </p>
        </div>
      ))}
      </div>
      {/* 故事弧、故事序、叙事序、情节关系的边目录暂时隐藏。恢复圆图时用 inViewEdge 与 GRAPH_VIEWS 接回。 */}
    </aside>
  );
}

function VertexDetail({
  vertex,
  graph,
  spine,
  issues,
  facts,
  onDocument,
  onStoryOrder,
  onSaveFact,
  onOpenNode,
  onSelectEdge,
  onClear,
}: {
  vertex: EventGraph["vertices"][number];
  graph: EventGraph;
  spine: boolean;
  issues: readonly StoryDocumentIssue[];
  facts: OutlineFacts | null;
  onDocument?: EventGraphPanelProps["onDocument"];
  onStoryOrder?: EventGraphPanelProps["onStoryOrder"];
  onSaveFact?: EventGraphPanelProps["onSaveFact"];
  onOpenNode?: EventGraphPanelProps["onOpenNode"];
  onSelectEdge: (id: string) => void;
  onClear: () => void;
}) {
  const outs = graph.edges.filter((edge) => edge.from === vertex.id);
  const ins = graph.edges.filter((edge) => edge.to === vertex.id);
  const editable = Boolean(onSaveFact) && !vertex.proposal;
  return (
    <div>
      <p className="m-0 text-[11px] font-semibold text-text-subtle">{vertex.proposal ? "候选" : vertex.kind === "arc" ? "阶段" : `事件 · ${vertex.chapter || "未入章"}`}{facts ? ` · ${facts.statusLabel}` : ""}</p>
      <h2 className="m-0 text-lg font-semibold">{vertex.name}</h2>
      <p className="mb-3 mt-1 text-[13px] leading-6 text-text-secondary">{facts ? "目标、冲突和结果可以改。确认叶子后，才能映射到章节并进入写作。" : spine ? "候选还没写入正式主线。" : "相关的点和边已聚焦，其余仍以淡色留在图上。"}</p>
      {facts && (
        <div className="grid gap-2">
          <Fact label="名称" value={facts.title} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "title", value)} />
          <Fact label="事件摘要" value={facts.summary} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "summary", value)} />
          <Fact label="目标" value={facts.goal} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "goal", value)} />
          <Fact label="冲突" value={facts.conflict} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "conflict", value)} />
          <Fact label="结果" value={facts.outcome} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "outcome", value)} />
          <Fact label="地点" value={facts.locationText} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "locationText", value)} />
          <Fact label="时间" value={facts.timeText} disabled={!editable} onSave={(value) => onSaveFact?.(vertex.id, "timeText", value)} />
        </div>
      )}
      {facts && facts.events.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">这一阶段里的事件</h3>
          <div className="grid gap-1">
            {facts.events.map((event) => (
              <button key={event.id} className="rounded-lg bg-transparent px-1 py-1 text-left text-[13px] hover:bg-muted" type="button" onClick={() => onOpenNode?.(event.id)}>
                <b className="font-semibold">{event.title}</b>
                <span className="mt-0.5 block text-xs text-text-secondary">结果：{event.outcome.trim() || "待定"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!facts && vertex.proposal && (
        <p className="text-[13px] leading-6 text-text-secondary">{vertex.summary || "这份候选还没有摘要。"}{vertex.changeAfter ? ` 结果：${vertex.changeAfter}` : ""}</p>
      )}
      {!facts && !vertex.proposal && onDocument && (
        <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">文档
          <textarea
            className="min-h-40 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs font-normal leading-5 text-foreground outline-none focus:border-accent-border"
            aria-label={`${vertex.name}的文档`}
            key={vertex.id}
            defaultValue={vertex.document}
            onBlur={(event) => {
              if (event.currentTarget.value === vertex.document) return;
              onDocument(vertex.id, event.currentTarget.value);
            }}
          />
        </label>
      )}
      {editable && onStoryOrder && (
        <label className="mt-3 grid gap-1 text-[11px] font-semibold text-text-subtle">故事序
          <input
            className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground outline-none focus:border-accent-border"
            type="number"
            min={1}
            defaultValue={(vertex.story ?? 0) + 1}
            key={`${vertex.id}:${vertex.story ?? 0}`}
            aria-label={`${vertex.name}的故事序`}
            onBlur={(event) => {
              const next = Number(event.currentTarget.value);
              if (!Number.isInteger(next) || next < 1) return;
              onStoryOrder(vertex.id, next - 1);
            }}
          />
        </label>
      )}
      {issues.length > 0 && (
        <ul className="mt-2 grid gap-1 pl-4 text-[12px] leading-5 text-danger-text">
          {issues.map((issue) => <li key={issue.message}>{issue.message}</li>)}
        </ul>
      )}
      <p className="mb-1 mt-4 text-[11px] text-muted-foreground">相连 {outs.length + ins.length}</p>
      <h3 className="mb-1.5 mt-1 text-xs font-semibold text-muted-foreground">出边</h3>
      <div className="grid gap-1">{outs.length > 0 ? outs.map((item) => <EdgeButton key={item.id} edge={item} graph={graph} onSelect={onSelectEdge} />) : <span className="text-[13px] text-text-secondary">没有出边</span>}</div>
      <h3 className="mb-1.5 mt-3.5 text-xs font-semibold text-muted-foreground">入边</h3>
      <div className="grid gap-1">{ins.length > 0 ? ins.map((item) => <EdgeButton key={item.id} edge={item} graph={graph} onSelect={onSelectEdge} />) : <span className="text-[13px] text-text-secondary">没有入边</span>}</div>
      <button className="mt-3 border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onClear}>回到这一层</button>
    </div>
  );
}

function Fact({ label, value, disabled, onSave }: {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onSave: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">{label}
      <textarea
        className="min-h-14 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs font-normal leading-5 text-foreground outline-none focus:border-accent-border disabled:opacity-70"
        aria-label={label}
        key={`${label}:${value}`}
        defaultValue={value}
        placeholder="待定"
        disabled={disabled}
        onBlur={(event) => {
          if (event.currentTarget.value === value) return;
          onSave(event.currentTarget.value);
        }}
      />
    </label>
  );
}

function EdgeDetail({ edge, graph, onClear }: { edge: GraphEdge; graph: EventGraph; onClear: () => void }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-semibold text-text-subtle">边</p>
      <h2 className="m-0 text-lg font-semibold">{edge.label}</h2>
      <div className="mt-3"><EdgeButton edge={edge} graph={graph} active onSelect={() => undefined} /></div>
      <div className="mt-2 grid gap-2">
        <Field label="类型" value={EDGE_TYPE_NAME[edge.type] ?? edge.type} />
        <Field label="说明" value={edge.detail || "这条边只记录方向和类型"} />
      </div>
      <button className="mt-3 border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onClear}>回到这一层</button>
    </div>
  );
}

function EdgeButton({ edge, graph, active = false, onSelect }: { edge: GraphEdge; graph: EventGraph; active?: boolean; onSelect: (id: string) => void }) {
  const name = (id: string) => graph.vertices.find((vertex) => vertex.id === id)?.name ?? id;
  return (
    <button
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-lg border-0 px-1 py-1.5 text-left text-[13px]",
        active ? "bg-accent text-accent-foreground" : "bg-transparent hover:bg-muted",
      )}
      type="button"
      onClick={() => onSelect(edge.id)}
    >
      <b className="truncate font-semibold">{name(edge.from)}</b>
      <i className="text-[11px] not-italic text-text-subtle">{edge.label}</i>
      <b className="truncate text-right font-semibold">{name(edge.to)}</b>
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border pt-2">
      <b className="block text-[11px] font-semibold text-text-subtle">{label}</b>
      <span className="text-[13px] leading-6">{value}</span>
    </div>
  );
}
