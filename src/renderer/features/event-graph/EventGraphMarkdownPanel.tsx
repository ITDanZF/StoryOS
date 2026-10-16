import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { StoryDocumentIssue } from "./model/storyDocument.ts";
import { EDGE_TYPE_NAME, type EventGraph, type GraphEdge, type GraphSelection } from "./model/buildEventGraph.ts";
import type { OutlineFacts } from "./EventGraphPanel.tsx";
import type { OutlinePlanningField } from "../../../shared/contracts/outline/outlineContracts.ts";

type Props = {
  readonly projectId?: string;
  readonly graph: EventGraph;
  readonly selection: GraphSelection;
  readonly facts: OutlineFacts | null;
  readonly issues: readonly StoryDocumentIssue[];
  readonly banner?: ReactNode;
  readonly idle?: ReactNode;
  readonly onClear: () => void;
  readonly onOpenNode?: (id: string) => void;
  readonly onDocument?: (id: string, markdown: string) => void;
  readonly onStoryOrder?: (id: string, order: number) => void;
  readonly onSaveFact?: (id: string, field: "title" | "summary" | "goal" | "conflict" | "outcome" | "locationText" | "timeText", value: string) => void;
  readonly onPlanField?: (id: string, field: OutlinePlanningField) => void;
  readonly onPlanRelation?: (sourceNodeId: string, targetNodeId: string) => void;
  readonly onEditMapping?: (nodeId: string) => void;
  readonly onGenerateNode?: (nodeId: string) => void;
};

const proseClass = "text-[13px] leading-6 text-foreground [&_a]:text-accent-foreground [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-accent-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-1 [&_p]:my-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";
const semantic = (type: string) => !["contains", "story", "narrative"].includes(type);

export default function EventGraphMarkdownPanel({ projectId, graph, selection, facts, issues, banner, idle, onClear, onOpenNode, onDocument, onStoryOrder, onSaveFact, onPlanField, onPlanRelation, onEditMapping, onGenerateNode }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const vertex = selection?.kind === "nodes" ? graph.vertices.find((item) => item.id === selection.ids[0]) : undefined;
  const edge = selection?.kind === "edge" ? graph.edges.find((item) => item.id === selection.id) : undefined;
  const [editing, setEditing] = useState(false);
  const [relationTarget, setRelationTarget] = useState("");
  const [reverseRelation, setReverseRelation] = useState(false);
  const [source, setSource] = useState("");
  useEffect(() => {
    setEditing(false);
    setRelationTarget("");
    setReverseRelation(false);
    setSource(vertex?.document ?? "");
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [vertex?.id, vertex?.document]);
  const related = useMemo(() => vertex ? graph.edges.filter((item) => semantic(item.type) && (item.from === vertex.id || item.to === vertex.id)) : [], [graph.edges, vertex]);
  const names = useMemo(() => new Map(graph.vertices.map((item) => [item.name, item.id])), [graph.vertices]);
  const markdown = vertex ? withRelations(withFacts(vertex.document || `# ${vertex.name}`, facts), facts ? related : [], graph, vertex.id).replace(/\[\[([^\]]+)\]\]/g, (match, title: string) => {
    const id = names.get(title);
    return id ? `[${title}](#event-node:${encodeURIComponent(id)})` : match;
  }) : "";

  return <aside ref={panelRef} className="min-h-0 overflow-auto border-t border-border bg-card md:border-l md:border-t-0" aria-label="事件文档">
    {banner}
    <div className="px-5 pb-8 pt-5">
      {vertex && <>
        <div className="mb-5 flex items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <p className="m-0 text-[11px] font-semibold tracking-wide text-accent-foreground">{vertex.kind === "arc" ? "阶段文档" : "事件文档"}</p>
            <p className="m-0 mt-1 text-[11px] text-text-secondary">{vertex.proposal ? "AI 候选" : facts?.statusLabel ?? "主线节点"} · 点击图中节点切换文档</p>
          </div>
          {(facts && onSaveFact || !facts && !vertex.proposal && onDocument) && <button type="button" className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setEditing((value) => !value)}>{editing ? "完成" : "编辑"}</button>}
        </div>
        {editing && facts && onSaveFact ? <div className="grid gap-3">
          <p className="m-0 text-xs leading-5 text-text-secondary">修改结构化事实后，文档随主线数据更新。</p>
          {([["名称", "title"], ["事件摘要", "summary"], ["目标", "goal"], ["阻力", "conflict"], ["结果", "outcome"], ["地点", "locationText"], ["时间", "timeText"]] as const).map(([label, field]) => <div key={field} className="grid gap-1"><div className="flex items-center justify-between"><span className="text-xs font-medium text-text-secondary">{label}</span>{onPlanField && <button type="button" className="text-xs text-accent-foreground hover:underline" onClick={() => { setEditing(false); onPlanField(vertex.id, field); }}>AI 完善</button>}</div><textarea aria-label={label} key={`${vertex.id}:${field}:${facts[field]}`} className="min-h-16 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal leading-6 text-foreground outline-none focus:border-accent-border" defaultValue={facts[field]} onBlur={(event) => { if (event.currentTarget.value !== facts[field]) onSaveFact(vertex.id, field, event.currentTarget.value); }} /></div>)}
          {onStoryOrder && <label className="grid gap-1 text-xs font-medium text-text-secondary">故事序<input type="number" min={1} className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm text-foreground" defaultValue={(vertex.story ?? 0) + 1} onBlur={(event) => { const next = Number(event.currentTarget.value); if (Number.isInteger(next) && next > 0) onStoryOrder(vertex.id, next - 1); }} /></label>}
        </div> : editing && onDocument ? <div className="grid gap-3">
          <p className="m-0 text-xs leading-5 text-text-secondary">这份 Markdown 文档用于界面演示；保存仅更新当前页面。</p>
          <textarea aria-label="Markdown 文档源文件" className="min-h-80 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-6 text-foreground outline-none focus:border-accent-border" value={source} onChange={(event) => setSource(event.target.value)} />
          <button type="button" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground" onClick={() => { onDocument(vertex.id, source); setEditing(false); }}>保存文档</button>
        </div> : <div className={proseClass}><ReactMarkdown components={{ a: ({ href, children }) => href?.startsWith("#event-node:") ? <button type="button" className="border-0 bg-transparent p-0 text-left text-accent-foreground underline underline-offset-2" onClick={() => onOpenNode?.(decodeURIComponent(href.slice(12)))}>{children}</button> : <a href={href}>{children}</a> }}>{markdown}</ReactMarkdown></div>}
        {facts?.events.length ? <section className="mt-6 border-t border-border pt-4"><h3 className="m-0 mb-2 text-xs font-semibold text-text-secondary">本阶段事件</h3><div className="grid gap-1">{facts.events.map((item) => <button key={item.id} type="button" className="rounded-lg px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => onOpenNode?.(item.id)}>{item.title}<span className="block text-xs text-text-secondary">{item.outcome || "结果待定"}</span></button>)}</div></section> : null}
        {facts && vertex.kind !== "arc" && <section className="mt-6 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2"><h3 className="m-0 text-xs font-semibold">章节片段</h3>{onEditMapping && <button type="button" className="text-xs text-accent-foreground hover:underline" onClick={() => onEditMapping(vertex.id)}>管理映射</button>}</div>
          {facts.chapterMappings.length === 0 ? <p className="text-xs text-text-secondary">尚未安排到章节。</p> : <div className="mt-2 grid gap-2">{facts.chapterMappings.map((mapping) => <div key={mapping.chapterId} className="rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5">
            <div className="flex items-center justify-between gap-2"><b>{mapping.chapterLabel}</b><span className="text-text-secondary">{mapping.coverageLabel}</span></div>
            <p className="m-0 text-text-secondary">片段：{mapping.segmentIntent}</p><p className="m-0 text-text-secondary">变化：{mapping.expectedLocalChange}</p>
          </div>)}</div>}
        </section>}
        {facts && facts.evidence.length > 0 && <section className="mt-6 border-t border-border pt-4">
          <h3 className="m-0 mb-2 text-xs font-semibold">正文依据</h3>
          <div className="grid gap-2">{facts.evidence.map((item) => <div key={`${item.chapterId}:${item.revisionId}:${item.startOffset}`} className="rounded-lg border-l-2 border-accent-border bg-muted p-3 text-xs leading-5">
            <div className="flex items-center gap-2">{projectId && <a href={`#/projects/${projectId}/book?chapter=${encodeURIComponent(item.chapterId)}`} className="text-accent-foreground underline">打开来源章节</a>}{item.stale && <span className="text-warning-text">来自旧修订，待复核</span>}</div>
            <p className="m-0 mt-1">「{item.excerpt}」</p>
          </div>)}</div>
        </section>}
        {facts && onGenerateNode && <button type="button" className="mt-5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted" onClick={() => onGenerateNode(vertex.id)}>{vertex.kind === "arc" ? "生成本阶段正文" : "生成此事件正文"}</button>}
        {onPlanRelation && !vertex.proposal && vertex.kind !== "arc" && <section className="mt-6 border-t border-border pt-4">
          <h3 className="m-0 mb-2 text-xs font-semibold">规划事件关系</h3>
          <p className="m-0 mb-2 text-xs leading-5 text-text-secondary">选择另一事件，再决定关系方向。AI 会提出类型和依据，确认后才写入图。</p>
          <div className="grid gap-2">
            <select aria-label="关系目标事件" className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground" value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}>
              <option value="">选择另一事件</option>
              {graph.vertices.filter((item) => item.id !== vertex.id && item.kind !== "arc" && !item.proposal).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={reverseRelation} onChange={(event) => setReverseRelation(event.target.checked)} />反向：另一事件 → 当前事件</label>
            <button type="button" className="w-fit rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50" disabled={!relationTarget} onClick={() => onPlanRelation(reverseRelation ? relationTarget : vertex.id, reverseRelation ? vertex.id : relationTarget)}>AI 规划关系</button>
          </div>
        </section>}
        {issues.length > 0 && <ul className="mt-4 list-disc pl-4 text-xs leading-5 text-danger-text">{issues.map((issue) => <li key={issue.message}>{issue.message}</li>)}</ul>}
        <button type="button" className="mt-6 border-0 bg-transparent p-0 text-xs text-text-secondary hover:text-foreground" onClick={onClear}>关闭文档</button>
      </>}
      {edge && <div><p className="m-0 text-[11px] text-accent-foreground">关系</p><h2 className="mt-1 text-lg font-semibold">{edge.label}</h2><p className="text-sm leading-6 text-text-secondary">{edge.detail || "这条连接尚无说明。"}</p><div className="mt-3 flex flex-wrap gap-2">{[edge.from, edge.to].map((id) => <button key={id} type="button" className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" onClick={() => onOpenNode?.(id)}>{graph.vertices.find((item) => item.id === id)?.name ?? id}</button>)}</div>{onPlanRelation && <button type="button" className="mt-5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted" onClick={() => onPlanRelation(edge.from, edge.to)}>AI 规划此关系</button>}<button type="button" className="mt-5 ml-3 text-xs text-accent-foreground" onClick={onClear}>返回画布</button></div>}
      {!vertex && !edge && (idle ?? <div><p className="m-0 text-[11px] font-semibold text-accent-foreground">事件图</p><h2 className="mt-2 text-lg font-semibold">选择一段故事</h2><p className="text-sm leading-6 text-text-secondary">点击画布中的事件卡片，阅读完整的节点文档；点击底部的阶段大括号，查看阶段目标与转折。</p><p className="mt-5 text-xs text-text-secondary">{graph.vertices.filter((item) => item.kind === "arc").length} 个阶段 · {graph.vertices.filter((item) => item.kind !== "arc").length} 个事件</p></div>)}
    </div>
  </aside>;
}

function withFacts(document: string, facts: OutlineFacts | null): string {
  if (!facts) return document;
  const fields = [["目标", facts.goal], ["阻力", facts.conflict], ["结果", facts.outcome], ["地点", facts.locationText], ["时间", facts.timeText]].filter(([, value]) => value.trim());
  if (fields.length === 0) return document;
  const section = `## ${facts.events.length > 0 ? "阶段核心" : "事件核心"}\n${fields.map(([label, value]) => `- **${label}**：${value}`).join("\n")}`;
  const marker = "\n## ";
  const index = document.indexOf(marker);
  return index < 0 ? `${document}\n\n${section}` : `${document.slice(0, index)}\n\n${section}${document.slice(index)}`;
}

function withRelations(document: string, relations: readonly GraphEdge[], graph: EventGraph, nodeId: string): string {
  if (relations.length === 0) return document;
  const base = document.replace(/\n## 关系\s*\n[\s\S]*?(?=\n## |$)/, "").trimEnd();
  const rows = relations.map((relation) => {
    const otherId = relation.from === nodeId ? relation.to : relation.from;
    const title = graph.vertices.find((item) => item.id === otherId)?.name ?? otherId;
    const direction = relation.from === nodeId ? "→" : "←";
    return `- **${EDGE_TYPE_NAME[relation.type] ?? relation.type} ${direction}** [${title}](#event-node:${encodeURIComponent(otherId)})：${relation.detail || "关系依据待补"}`;
  });
  return `${base}\n\n## 关系\n${rows.join("\n")}`;
}
