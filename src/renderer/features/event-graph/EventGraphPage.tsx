import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader, PageSurface } from "../../components/layout/PageSurface.tsx";
import { cn } from "../../../lib/utils.ts";
import EventGraphCanvas from "./EventGraphCanvas.tsx";
import EventGraphComposer from "./EventGraphComposer.tsx";
import EventGraphInspector from "./EventGraphInspector.tsx";
import {
  GRAPH_VIEWS,
  buildEventGraph,
  drawEdges,
  vertexEmphasis,
  type GraphSelection,
  type GraphView,
} from "./model/buildEventGraph.ts";
import { buildProseBrief, previewProposal } from "./model/document.ts";
import useEventGraphSession from "./useEventGraphSession.ts";

export default function EventGraphPage() {
  const { projectId } = useParams();
  if (!projectId) return null;
  return <EventGraphWorkspace projectId={projectId} />;
}

function EventGraphWorkspace({ projectId }: { readonly projectId: string }) {
  const session = useEventGraphSession(projectId);
  const [view, setView] = useState<GraphView>("arc");
  const [chapter, setChapter] = useState("all");
  const [selection, setSelection] = useState<GraphSelection>(null);
  const [dragged, setDragged] = useState<Readonly<Record<string, { readonly x: number; readonly y: number }>>>({});
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [pan, setPan] = useState({ x: 24, y: 24, scale: 1 });
  const [draft, setDraft] = useState("");
  const proseKey = `storyos.event-graph.prose.${projectId}`;
  const [proseEnabled, setProseEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(proseKey) === "1";
    } catch {
      return false;
    }
  });
  const sourceKey = `${session.document.source}:${session.document.outlineId ?? ""}`;
  const [seenSource, setSeenSource] = useState(sourceKey);
  if (seenSource !== sourceKey) {
    setSeenSource(sourceKey);
    setChapter("all");
    setSelection(null);
  }

  useEffect(() => {
    try {
      setProseEnabled(window.localStorage.getItem(proseKey) === "1");
    } catch {
      setProseEnabled(false);
    }
  }, [proseKey]);

  const preview = useMemo(
    () => (session.proposal ? previewProposal(session.proposal) : null),
    [session.proposal],
  );
  const labels = useMemo(
    () => new Map(session.chapters.map((item) => [item.id, item.label])),
    [session.chapters],
  );
  const graph = useMemo(
    () => buildEventGraph(
      session.document,
      chapter,
      dragged,
      labels,
      session.proposal?.status === "draft" ? preview : null,
    ),
    [chapter, dragged, labels, preview, session.document, session.proposal],
  );
  const vertices = graph.vertices.map((vertex) => ({
    ...vertex,
    emphasis: vertexEmphasis(graph, view, selection, vertex),
    chosen: selection?.kind === "nodes" && selection.ids.includes(vertex.id),
  }));
  const edges = drawEdges(graph, view, selection);
  const selectedIds = selection?.kind === "nodes"
    ? selection.ids.filter((id) => session.document.nodes.some((node) => node.id === id))
    : [];
  const brief = proseEnabled && selection?.kind === "nodes"
    ? buildProseBrief(session.document, selectedIds, session.chapters)
    : null;

  const selectNode = (id: string, shiftKey: boolean) => {
    setSelection((current) => {
      if (!shiftKey) return { kind: "nodes", ids: [id] };
      const ids = current?.kind === "nodes" ? current.ids : [];
      const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
      return next.length > 0 ? { kind: "nodes", ids: next } : null;
    });
  };

  return (
    <PageSurface aria-label="事件图">
      <PageHeader className="h-14" actions={
        <>
          <div className="flex rounded-[10px] border border-border bg-card p-0.5" role="group" aria-label="层级">
            {GRAPH_VIEWS.map(([id, label]) => (
              <button key={id} className={cn("h-7 rounded-md border-0 bg-transparent px-2.5 text-xs", view === id && "bg-accent text-accent-foreground")} type="button" onClick={() => { setView(id); setSelection(null); }}>{label}</button>
            ))}
          </div>
          <select
            className="hidden h-8 rounded-lg border border-border bg-card px-2 text-xs sm:block"
            aria-label="章节"
            value={chapter}
            onChange={(event) => { setChapter(event.target.value); setSelection(null); }}
          >
            <option value="all">全书</option>
            {session.chapters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button
            className={cn("h-8 rounded-lg border px-2.5 text-xs", proseEnabled ? "border-accent-border bg-accent text-accent-foreground" : "border-border bg-card")}
            type="button"
            aria-pressed={proseEnabled}
            onClick={() => {
              const next = !proseEnabled;
              setProseEnabled(next);
              try {
                window.localStorage.setItem(proseKey, next ? "1" : "0");
              } catch {
                /* The switch still applies for this visit when storage is blocked. */
              }
            }}
          >生成正文 {proseEnabled ? "开" : "关"}</button>
          <button className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs" type="button" onClick={() => { setDragged({}); setLayoutEpoch((value) => value + 1); }}>复位布局</button>
        </>
      }>
        <div className="min-w-0 py-2">
          <h1 className="m-0 truncate text-sm font-semibold">事件图</h1>
          <p className="m-0 truncate text-[11px] text-muted-foreground">
            {session.document.source === "sample" ? `${session.document.title} · 示例` : session.document.title}
            {" · "}
            |V| {graph.vertices.length} · |E| {graph.edges.length}
            {session.loading ? " · 正在读取" : ""}
          </p>
        </div>
      </PageHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col">
          <EventGraphCanvas
            view={view}
            vertices={vertices}
            edges={edges}
            width={graph.width}
            height={graph.height}
            frameKey={`${view}:${chapter}:${layoutEpoch}:${sourceKey}:${session.document.nodes.length}`}
            pan={pan}
            onPan={setPan}
            onSelectVertex={selectNode}
            onMoveVertex={(id, point) => setDragged((current) => ({ ...current, [id]: point }))}
            onSelectEdge={(id) => setSelection({ kind: "edge", id })}
            onClear={() => setSelection(null)}
          />
          <EventGraphComposer
            scopeLabel={session.document.source === "sample"
              ? "示例 · 发送后写入这本书"
              : selectedIds.length > 0 ? `已选 ${selectedIds.length} 个节点` : "全书"}
            placeholder={selectedIds.length > 0 ? "说明要怎么改这几个节点" : "输入一个故事想法，生成下一层事件"}
            draft={draft}
            busy={session.busy}
            proseEnabled={proseEnabled}
            proposal={session.proposal}
            preview={preview}
            brief={brief}
            notice={session.notice}
            onDraftChange={setDraft}
            onSubmit={() => {
              const text = draft;
              void session.submit(text, selectedIds).then((accepted) => {
                if (accepted) setDraft("");
              });
            }}
            onAccept={session.acceptProposal}
            onDiscard={session.discardProposal}
            onWrite={() => { if (brief) session.writeProse(brief); }}
            onDismissNotice={session.dismissNotice}
          />
        </div>
        <EventGraphInspector
          document={session.document}
          graph={graph}
          view={view}
          selection={selection}
          chapters={session.chapters}
          preview={preview}
          busy={session.busy}
          onSelectEdge={(id) => setSelection({ kind: "edge", id })}
          onClear={() => setSelection(null)}
          onSaveNode={session.saveNode}
          onCreateNext={(fromId, input) => {
            const createdId = session.createNext(fromId, input);
            if (createdId) setSelection({ kind: "nodes", ids: [createdId] });
          }}
          onSaveRelation={session.saveRelation}
          onDeleteRelation={(id) => {
            session.deleteRelation(id);
            setSelection(null);
          }}
        />
      </div>
    </PageSurface>
  );
}
