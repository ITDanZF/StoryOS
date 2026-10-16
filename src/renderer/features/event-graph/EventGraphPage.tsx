import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { NodeBackfillEvidence, OutlinePatchOperation, OutlinePlanningField, OutlinePlanningScope } from "../../../shared/contracts/outline/outlineContracts.ts";
import { AnimatedDialog } from "../../components/motion/index.ts";
import { PageSurface } from "../../components/layout/PageSurface.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { DialogFooter, DialogHeader } from "../../components/ui/Dialog.tsx";
import { Input } from "../../components/ui/Field.tsx";
import { cn } from "../../../lib/utils.ts";
import ChapterHandoffDialog from "./ChapterHandoffDialog.tsx";
import ChapterMappingDialog from "./ChapterMappingDialog.tsx";
import EventGraphBackfillDialog from "./EventGraphBackfillDialog.tsx";
import EventGraphWritingDialog from "./EventGraphWritingDialog.tsx";
import EventGraphAgent from "./EventGraphAgent.tsx";
import EventGraphPanel, { type OutlineFacts } from "./EventGraphPanel.tsx";
import EventGraphProfile from "./EventGraphProfile.tsx";
import EventGraphProposal from "./EventGraphProposal.tsx";
import EventGraphSpine from "./EventGraphSpine.tsx";
import EventGraphStaticPreview from "./EventGraphStaticPreview.tsx";
import { buildEventGraph, type GraphSelection } from "./model/buildEventGraph.ts";
import { chapterMainline, deleteImpact, deviationImpact } from "./model/chapterMainline.ts";
import {
  applyNodeDocument,
  isLeaf,
  NODE_STATUS_LABEL,
  planNextNode,
  previewProposal,
  toUpdateInput,
  type GraphDocument,
} from "./model/document.ts";
import type { SpineItem } from "./model/spine.ts";
import { type StoryDocumentIssue } from "./model/storyDocument.ts";
import useEventGraphSession from "./useEventGraphSession.ts";

export default function EventGraphPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  if (searchParams.get("demo") === "1") return <EventGraphStaticPreview onExit={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete("demo"); return next; })} />;
  return <EventGraphWorkspace key={projectId} projectId={projectId} />;
}

function EventGraphWorkspace({ projectId }: { readonly projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useEventGraphSession(projectId);
  const [chapter, setChapter] = useState(searchParams.get("chapter") ?? "all");
  const [selection, setSelection] = useState<GraphSelection>(null);
  const [stageOpen, setStageOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [mappingNodeId, setMappingNodeId] = useState<string | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [writingOpen, setWritingOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [documentIssues, setDocumentIssues] = useState<{ readonly id: string; readonly issues: readonly StoryDocumentIssue[] } | null>(null);
  const [nodeEvidence, setNodeEvidence] = useState<readonly NodeBackfillEvidence[]>([]);
  const seenChapter = useRef(searchParams.get("chapter"));
  const seenNode = useRef<string | null>(null);
  const nodeQuery = searchParams.get("node");

  useEffect(() => {
    const requested = searchParams.get("chapter");
    if (!requested || seenChapter.current === requested) return;
    seenChapter.current = requested;
    setChapter(requested);
  }, [searchParams]);

  useEffect(() => {
    if (!nodeQuery || seenNode.current === nodeQuery || !session.snapshot?.nodes.some((node) => node.id === nodeQuery)) return;
    seenNode.current = nodeQuery;
    setSelection({ kind: "nodes", ids: [nodeQuery] });
  }, [nodeQuery, session.snapshot]);

  const chapterLabels = useMemo(() => new Map(session.chapters.map((item) => [item.id, item.label])), [session.chapters]);
  const proposalPreview = session.proposal?.status === "draft" ? previewProposal(session.proposal) : null;
  const preview = proposalPreview;
  const graph = useMemo(
    () => buildEventGraph(session.document, chapter, {}, chapterLabels, preview),
    [chapter, chapterLabels, preview, session.document],
  );
  const selectedId = selection?.kind === "nodes" ? selection.ids[0] : undefined;
  const selectedVertex = selectedId ? graph.vertices.find((vertex) => vertex.id === selectedId) : undefined;
  const selectedNode = selectedId ? session.document.nodes.find((node) => node.id === selectedId) : undefined;
  useEffect(() => {
    if (!selectedId) { setNodeEvidence([]); return; }
    setNodeEvidence([]);
    let cancelled = false;
    void window.storyOSAgent.getNodeBackfillEvidence(projectId, selectedId)
      .then((evidence) => { if (!cancelled) setNodeEvidence(evidence); })
      .catch(() => { if (!cancelled) setNodeEvidence([]); });
    return () => { cancelled = true; };
  }, [projectId, selectedId, session.snapshot?.outline.revision]);
  const selectedEdge = selection?.kind === "edge" ? graph.edges.find((edge) => edge.id === selection.id) : undefined;
  const planningScope: OutlinePlanningScope = selectedEdge && selectedEdge.type !== "contains"
    ? { kind: "relation", sourceNodeId: selectedEdge.from, targetNodeId: selectedEdge.to }
    : selectedNode?.kind === "arc"
      ? { kind: "stage", stageId: selectedNode.id }
      : selectedNode
        ? { kind: "node", nodeId: selectedNode.id }
        : { kind: "book" };
  const writingOptions = session.snapshot?.nodes.filter((node) => node.kind === "arc" || node.kind === "event" && isLeaf(session.document, node.id))
    .map((node) => ({ scope: { kind: node.kind === "arc" ? "stage" as const : "node" as const, id: node.id }, label: `${node.kind === "arc" ? "阶段" : "事件"} · ${node.title}` })) ?? [];
  const chapterLeaves = session.snapshot && chapter !== "all" ? chapterMainline(session.snapshot, chapter, null) : [];
  const facts: OutlineFacts | null = useMemo(() => {
    const node = session.snapshot?.nodes.find((item) => item.id === selectedId);
    if (!node || !session.snapshot) return null;
    return {
      title: node.title,
      summary: node.summary,
      goal: node.goal,
      conflict: node.conflict,
      outcome: node.outcome,
      locationText: node.locationText,
      timeText: node.timeText,
      statusLabel: NODE_STATUS_LABEL[node.status],
      events: session.snapshot.nodes
        .filter((item) => item.parentId === node.id)
        .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id))
        .map((item) => ({ id: item.id, title: item.title, outcome: item.outcome })),
      chapterMappings: session.snapshot.mappings.filter((mapping) => mapping.nodeId === node.id).map((mapping) => {
        const chapter = session.chapters.find((item) => item.id === mapping.chapterId);
        const stale = mapping.verificationChapterRevisionId !== null && mapping.verificationChapterRevisionId !== chapter?.currentRevisionId;
        return {
          chapterId: mapping.chapterId,
          chapterLabel: chapter?.label ?? mapping.chapterId,
          segmentIntent: mapping.segmentIntent,
          expectedLocalChange: mapping.expectedLocalChange,
          coverageLabel: stale ? "正文已改，待复核" : mapping.coverageStatus === "verified" ? "已核验" : mapping.coverageStatus === "drafted" ? "待核验" : mapping.coverageStatus === "deviated" ? "有意偏离" : "待编写",
        };
      }),
      evidence: nodeEvidence,
    };
  }, [nodeEvidence, selectedId, session.chapters, session.snapshot]);
  const impact = session.snapshot && pendingDelete ? deleteImpact(session.snapshot, pendingDelete) : null;
  const deviation = session.snapshot && selectedNode?.status === "needs_revision"
    ? deviationImpact(session.snapshot, selectedNode.id)
    : null;
  const spineItems = useMemo(() => spineItemsOf(session.document.nodes, preview?.nodes ?? [], session.snapshot?.mappings ?? []), [preview, session.document.nodes, session.snapshot?.mappings]);

  const createBlank = () => {
    const order = nextOrder(session.document);
    void session.applyOperations([{
      type: "create_node",
      tempId: `temp-${crypto.randomUUID()}`,
      value: {
        parentId: null,
        kind: "event",
        title: "空白节点",
        summary: "",
        structuralRole: "custom",
        narrativeFunction: "mixed",
        goal: "",
        conflict: "",
        outcome: "",
        locationText: "",
        timeText: "",
        storyOrder: order,
        narrativeOrder: order,
        status: "draft",
        notes: "",
        participants: [],
      },
    }]);
  };

  const saveIdea = (text: string) => {
    const order = nextOrder(session.document);
    return session.applyOperations([{
      type: "create_node",
      tempId: `temp-${crypto.randomUUID()}`,
      value: {
        parentId: selectedNode?.id ?? null,
        kind: "event",
        title: text,
        summary: "",
        structuralRole: "custom",
        narrativeFunction: "mixed",
        goal: "",
        conflict: "",
        outcome: "",
        locationText: "",
        timeText: "",
        storyOrder: order,
        narrativeOrder: order,
        status: "draft",
        notes: "",
        participants: [],
      },
    }]);
  };

  const placeCard = (id: string, orderedIds: readonly string[], parentId: string | null) => {
    if (!session.snapshot) return;
    const order = new Map(orderedIds.map((item, index) => [item, index]));
    const operations: OutlinePatchOperation[] = [];
    for (const node of session.snapshot.nodes) {
      const next = order.get(node.id);
      const changes: { narrativeOrder?: number; parentId?: string | null } = {};
      if (next !== undefined && next !== node.narrativeOrder) changes.narrativeOrder = next;
      if (node.id === id && parentId !== node.parentId) changes.parentId = parentId;
      if (changes.narrativeOrder !== undefined || changes.parentId !== undefined) {
        operations.push({ type: "update_node", nodeId: node.id, changes });
      }
    }
    void session.applyOperations(operations);
  };

  const insertAfter = (fromId: string) => {
    const source = session.document.nodes.find((node) => node.id === fromId);
    if (!source) return;
    const planned = planNextNode(session.document, fromId, {
      title: "新事件",
      summary: "",
      participants: [],
      link: source.kind === "arc" ? "child" : "sibling",
      relation: null,
    }, `temp-${crypto.randomUUID()}`);
    void session.applyOperations(planned.operations);
  };

  const commitDocument = (id: string, markdown: string) => {
    const applied = applyNodeDocument(session.document, id, markdown);
    setDocumentIssues({ id, issues: applied.issues });
    if (applied.issues.some((issue) => issue.blocking)) return;
    const node = applied.document.nodes.find((item) => item.id === id);
    if (!node || !session.snapshot) return;
    void session.updateNode(id, toUpdateInput(node));
  };

  if (session.loading) {
    return <PageSurface aria-label="事件图"><p className="p-6 text-sm text-text-secondary">正在读取这本书的事件图…</p></PageSurface>;
  }
  if (session.loadError) {
    return (
      <PageSurface aria-label="事件图">
        <div className="grid gap-3 p-6">
          <h1 className="m-0 text-sm font-semibold">事件图没有读到</h1>
          <p className="m-0 text-sm text-danger-text">{session.loadError}</p>
          <Button size="sm" onClick={() => void session.reload()}>重试</Button>
          <Button size="sm" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("demo", "1"); return next; })}>查看静态示例</Button>
        </div>
      </PageSurface>
    );
  }
  if (!session.bookReady && !session.snapshot) {
    return (
      <PageSurface aria-label="事件图">
        <div className="grid max-w-lg gap-3 p-6">
          <h1 className="m-0 text-lg font-semibold">先建立这本书</h1>
          <p className="m-0 text-sm leading-6 text-text-secondary">事件图属于当前书籍。请先在书籍工作区写下书名，再回到这里看图。</p>
          <a className="text-sm text-accent-foreground" href={`#/projects/${projectId}/book`}>前往书籍工作区</a>
          <button className="w-fit border-0 bg-transparent p-0 text-left text-sm text-accent-foreground" type="button" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("demo", "1"); return next; })}>查看事件图静态示例</button>
        </div>
      </PageSurface>
    );
  }
  if (!session.snapshot) {
    return <PageSurface aria-label="事件图">
      <EventGraphProfile snapshot={null} bookTitle={session.bookTitle} busy={session.busy} onCreate={session.createProfile} onSave={session.saveProfile} />
      <Button size="sm" className="mx-auto mt-4" disabled={session.busy} onClick={() => {
        void session.createProfile({ title: session.bookTitle.trim() || "全书主线", premise: "待从已有正文梳理", theme: "", coreConflict: "", climaxSummary: "", endingIntent: "" })
          .then(async (created) => { if (created) { setBackfillOpen(true); await session.scanExistingProse(); } });
      }}>从已有正文建立事件图</Button>
      <button className="mx-auto mt-4 block border-0 bg-transparent text-sm text-accent-foreground" type="button" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("demo", "1"); return next; })}>查看事件图静态示例</button>
      {session.notice && <p className="mx-auto w-full max-w-2xl px-6 text-sm text-danger-text">{session.notice}</p>}
    </PageSurface>;
  }

  return (
    <PageSurface aria-label="事件图" className="max-md:overflow-y-auto">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
        <div className="mr-auto flex min-w-0 items-baseline gap-3 py-1">
          <h1 className="m-0 text-sm font-semibold">事件图</h1>
          <Button size="sm" disabled={session.busy} onClick={() => setStageOpen(true)}>添加阶段</Button>
          <Button size="sm" disabled={session.busy} onClick={() => setBackfillOpen(true)}>从正文补事件</Button>
          <Button size="sm" disabled={session.busy} onClick={() => setWritingOpen(true)}>从图生成正文</Button>
          <Button size="sm" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("demo", "1"); return next; })}>查看示例</Button>
          {session.snapshot && <p className="m-0 truncate text-xs text-muted-foreground">修订 {session.snapshot.outline.revision}</p>}
        </div>
        {selectedNode && selectedNode.status === "draft" && !selectedVertex?.proposal && (
          <Button size="sm" disabled={session.busy} onClick={() => void session.updateNode(selectedNode.id, { status: "confirmed" })}>{selectedNode.kind === "arc" ? "确认阶段" : "确认事件"}</Button>
        )}
        {selectedNode && selectedNode.kind !== "arc" && selectedNode.status === "confirmed" && isLeaf(session.document, selectedNode.id) && (
          <Button size="sm" disabled={session.busy || session.chapters.length === 0} onClick={() => setMappingNodeId(selectedNode.id)}>
            章节片段 {session.snapshot.mappings.filter((mapping) => mapping.nodeId === selectedNode.id).length}
          </Button>
        )}
        <div className="flex rounded-[10px] border border-border bg-card p-0.5" role="group" aria-label="章节">
          <ChapterButton active={chapter === "all"} onClick={() => { setChapter("all"); setSelection(null); }}>全书</ChapterButton>
          {session.chapters.map((item) => (
            <ChapterButton key={item.id} active={chapter === item.id} onClick={() => { setChapter(item.id); setSelection(null); }}>{item.label}</ChapterButton>
          ))}
        </div>
        {chapter !== "all" && <Button size="sm" onClick={() => setHandoffOpen(true)}>查看本章主线</Button>}
      </header>
      <EventGraphProfile snapshot={session.snapshot} bookTitle={session.bookTitle} busy={session.busy} onCreate={session.createProfile} onSave={session.saveProfile} />
      {selectedNode?.status === "needs_revision" && (
        <div className="border-b border-border px-4 py-2 text-xs leading-5 text-text-secondary">
          <p className="m-0">「{selectedNode.title}」的结果和后续主线可能不一致。可预览主线调整；当前正文仍留在书籍工作区。</p>
          {deviation && deviation.relatedNodes.length > 0 && <p className="m-0">直接后续：{deviation.relatedNodes.map((node) => node.title).join("、")}</p>}
          {deviation && deviation.promises.length > 0 && <p className="m-0">相关承诺：{deviation.promises.join("、")}</p>}
        </div>
      )}
      {session.notice && (
        <p className="m-0 flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-xs text-danger-text">
          <span>{session.notice}</span>
          <button className="border-0 bg-transparent p-0" type="button" onClick={session.dismissNotice}>关闭</button>
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(500px,1fr)_minmax(220px,1fr)] md:grid-cols-[minmax(0,1fr)_360px] md:grid-rows-1">
        <div className="flex min-h-0 flex-col">
          <EventGraphSpine
            projectId={projectId}
            nodes={spineItems}
            chapterLabels={chapterLabels}
            chapter={chapter}
            selectedId={selectedId ?? null}
            onSelect={(id) => { setDocumentIssues(null); setSelection({ kind: "nodes", ids: [id] }); }}
            onPlace={placeCard}
            onInsertAfter={insertAfter}
            onAddEvent={insertAfter}
            onCreateBlank={createBlank}
            onRemove={(id) => setPendingDelete(id)}
            relations={[...session.document.relations, ...(preview?.relations ?? [])]}
            onClear={() => setSelection(null)}
          />
          <EventGraphAgent
            selectedNode={selectedNode ?? null}
            scope={planningScope}
            revisionFocusIds={deviation && selectedId ? [selectedId, ...deviation.relatedNodes.map((node) => node.id)] : []}
            busy={session.busy}
            onPropose={session.propose}
            onSaveIdea={saveIdea}
          />
        </div>
        <EventGraphPanel
          projectId={projectId}
          graph={graph}
          selection={selection}
          spine
          banner={session.proposal ? (
            <EventGraphProposal
              proposal={session.proposal}
              reading={session.reading}
              conflict={session.conflict}
              busy={session.busy}
              onEdit={session.editProposal}
              onAccept={() => void session.acceptProposal()}
              onDiscard={session.discardProposal}
              onRegenerate={() => void session.regenerate()}
            />
          ) : null}
          idle={chapter !== "all" ? (
            <div>
              <p className="m-0 text-[11px] font-semibold text-text-subtle">本章要完成的变化</p>
              {chapterLeaves.length === 0 && <p className="text-sm leading-6 text-text-secondary">这一章还没有叶子。确认事件后，用上方的章节把它放进来。</p>}
              <ul className="mt-2 grid gap-2">
                {chapterLeaves.map((leaf) => (
                  <li key={leaf.id}>
                    <b className="text-sm">{leaf.title}</b>
                    <span className="ml-2 text-xs text-text-subtle">{leaf.label}</span>
                    <p className="m-0 text-xs leading-5 text-text-secondary">目标：{show(leaf.goal)} · 冲突：{show(leaf.conflict)} · 结果：{show(leaf.outcome)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined}
          issues={documentIssues && selectedId === documentIssues.id ? documentIssues.issues : []}
          facts={facts}
          onSaveFact={(id, field, value) => void session.updateNode(id, { [field]: value })}
          onPlanField={(id: string, field: OutlinePlanningField) => void session.propose({ planningMode: "sequential", parentNodeId: null, focusNodeIds: [id], instruction: "", scope: { kind: "field", nodeId: id, field } })}
          onPlanRelation={(sourceNodeId, targetNodeId) => void session.propose({ planningMode: "sequential", parentNodeId: null, focusNodeIds: [sourceNodeId, targetNodeId], instruction: "", scope: { kind: "relation", sourceNodeId, targetNodeId } })}
          onEditMapping={(id) => setMappingNodeId(id)}
          onGenerateNode={(id) => { setSelection({ kind: "nodes", ids: [id] }); setWritingOpen(true); }}
          onOpenNode={(id) => setSelection({ kind: "nodes", ids: [id] })}
          onDocument={commitDocument}
          onStoryOrder={(id, storyOrder) => void session.updateNode(id, { storyOrder })}
          onSelectEdge={(id) => { setDocumentIssues(null); setSelection({ kind: "edge", id }); }}
          onClear={() => { setDocumentIssues(null); setSelection(null); }}
        />
      </div>
      {backfillOpen && <EventGraphBackfillDialog
        projectId={projectId}
        scan={session.backfillScan}
        chapterId={chapter === "all" ? null : chapter}
        volumes={session.volumes}
        nodeTitles={Object.fromEntries(session.snapshot.nodes.map((node) => [node.id, node.title]))}
        busy={session.busy}
        onClose={() => setBackfillOpen(false)}
        onScan={session.scanExistingProse}
        onCancel={session.cancelBackfill}
        onPreview={session.previewBackfillAcceptance}
        onAccept={session.acceptBackfill}
      />}
      {writingOpen && <EventGraphWritingDialog
        projectId={projectId}
        options={writingOptions}
        initialScope={selectedNode && (selectedNode.kind === "arc" || isLeaf(session.document, selectedNode.id)) ? { kind: selectedNode.kind === "arc" ? "stage" : "node", id: selectedNode.id } : session.graphWritingPlan?.scope ?? null}
        plan={session.graphWritingPlan}
        busy={session.busy}
        running={session.graphWritingRunning}
        onClose={() => setWritingOpen(false)}
        onPreview={session.previewGraphWriting}
        onStart={session.startGraphWriting}
        onCancel={session.cancelGraphWriting}
      />}
      {stageOpen && (
        <StageDialog
          busy={session.busy}
          onClose={() => setStageOpen(false)}
          onSubmit={(title) => {
            void session.applyOperations([{
              type: "create_node",
              tempId: `temp-${crypto.randomUUID()}`,
              value: {
                parentId: null,
                kind: "arc",
                title,
                summary: "",
                structuralRole: "custom",
                narrativeFunction: "mixed",
                goal: "",
                conflict: "",
                outcome: "",
                locationText: "",
                timeText: "",
                storyOrder: nextOrder(session.document),
                narrativeOrder: nextOrder(session.document),
                status: "draft",
                notes: "",
                participants: [],
              },
            }]).then((saved) => {
              if (saved) setStageOpen(false);
            });
          }}
        />
      )}
      {handoffOpen && chapter !== "all" && (
        <ChapterHandoffDialog
          key={`${projectId}:${chapter}`}
          projectId={projectId}
          chapterId={chapter}
          chapterLabel={chapterLabels.get(chapter) ?? "这一章"}
          allowWrite={false}
          onClose={() => setHandoffOpen(false)}
        />
      )}
      {mappingNodeId && session.snapshot.nodes.some((node) => node.id === mappingNodeId) && (
        <ChapterMappingDialog
          nodeTitle={session.snapshot.nodes.find((node) => node.id === mappingNodeId)?.title ?? "事件"}
          chapters={session.chapters}
          mappings={session.snapshot.mappings.filter((mapping) => mapping.nodeId === mappingNodeId)}
          busy={session.busy}
          onClose={() => setMappingNodeId(null)}
          onSave={(chapterId, segmentIntent, expectedLocalChange) => session.saveChapterMapping(mappingNodeId, chapterId, segmentIntent, expectedLocalChange)}
          onRemove={(chapterId) => session.removeChapterMapping(mappingNodeId, chapterId)}
        />
      )}
      {impact && pendingDelete && (
        <AnimatedDialog aria-labelledby="delete-node-title" busy={session.busy} onClose={() => setPendingDelete(null)} className="max-w-md rounded-2xl border border-border bg-card shadow-2xl">
          {({ close }) => (
            <div>
              <DialogHeader id="delete-node-title" title={`删除「${impact.title}」`} description="删除会同时去掉它的章节映射。承诺会留下警告，正文不会被删除。" onClose={close} busy={session.busy} />
              <div className="grid gap-2 px-5 py-4 text-sm text-text-secondary">
                <p className="m-0">
                  章节映射 {impact.chapters.length} 条，关系 {impact.relationCount} 条。
                  {session.snapshot?.nodes.some((node) => node.parentId === pendingDelete) ? "里面的事件会一起去掉。" : ""}
                  正文仍留在书籍里。
                </p>
                {impact.promises.length > 0 && <p className="m-0">相关承诺：{impact.promises.join("、")}</p>}
              </div>
              <DialogFooter>
                <Button size="sm" disabled={session.busy} onClick={close}>取消</Button>
                <Button size="sm" variant="danger" loading={session.busy} onClick={() => {
                  void session.applyOperations([{ type: "delete_node", nodeId: pendingDelete }]).then((saved) => {
                    if (saved) {
                      setSelection(null);
                      close();
                    }
                  });
                }}>删除</Button>
              </DialogFooter>
            </div>
          )}
        </AnimatedDialog>
      )}
    </PageSurface>
  );
}

function StageDialog({
  busy,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  return (
    <AnimatedDialog aria-labelledby="add-stage-title" busy={busy} onClose={onClose} className="max-w-md rounded-2xl border border-border bg-card shadow-2xl">
      {({ close }) => (
        <form onSubmit={(event) => {
          event.preventDefault();
          const name = title.trim();
          if (name === "") return;
          onSubmit(name);
        }}>
          <DialogHeader id="add-stage-title" title="添加阶段" description="阶段只是图上新的一行。冲突、高潮和结局以后写在这个阶段里，也可以再加别的阶段。" onClose={close} busy={busy} />
          <div className="px-5 py-4">
            <Input aria-label="阶段名称" autoFocus value={title} placeholder="例如：离开天空之城" disabled={busy} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <DialogFooter>
            <Button size="sm" disabled={busy} onClick={close}>取消</Button>
            <Button size="sm" variant="primary" type="submit" loading={busy} disabled={title.trim() === ""}>加到图上</Button>
          </DialogFooter>
        </form>
      )}
    </AnimatedDialog>
  );
}

function spineItemsOf(nodes: GraphDocument["nodes"], extra: GraphDocument["nodes"], mappings: readonly { readonly nodeId: string; readonly chapterId: string }[]): readonly SpineItem[] {
  return [...nodes, ...extra].map((node) => ({
    id: node.id,
    title: node.title,
    changeBefore: node.changeBefore,
    changeAfter: node.changeAfter,
    storyOrder: node.storyOrder,
    narrativeOrder: node.narrativeOrder,
    parentId: node.parentId,
    chapterId: node.chapterId,
    chapterIds: mappings.filter((mapping) => mapping.nodeId === node.id).map((mapping) => mapping.chapterId),
    proposal: node.proposal,
    kind: node.kind,
    summary: node.summary,
    status: node.status,
    participants: node.participants.map((person) => ({
      name: person.name,
      role: person.role,
      kind: person.kind,
      stateBefore: person.stateBefore,
      stateAfter: person.stateAfter,
    })),
  }));
}

function nextOrder(document: GraphDocument): number {
  return document.nodes.reduce((max, node) => Math.max(max, node.storyOrder, node.narrativeOrder), -1) + 1;
}

function ChapterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button className={cn("h-7 rounded-md border-0 bg-transparent px-2.5 text-xs", active && "bg-accent text-accent-foreground")} type="button" onClick={onClick}>{children}</button>
  );
}

function show(value: string): string {
  const text = value.trim();
  return text === "" ? "待定" : text;
}
