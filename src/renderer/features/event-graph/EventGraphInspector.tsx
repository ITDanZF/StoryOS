import { useState } from "react";
import type { OutlineNarrativeFunction, OutlineNodeStatus, OutlineParticipantRole, OutlineRelationType } from "../../../shared/contracts/outline/outlineContracts.ts";
import {
  NARRATIVE_FUNCTION_LABEL,
  NODE_STATUS_LABEL,
  PARTICIPANT_ROLE_LABEL,
  RELATION_LABEL,
  descendantIds,
  isLeaf,
  type ChapterOption,
  type GraphDocument,
  type GraphNode,
  type GraphParticipant,
  type GraphRelation,
  type NextNodeInput,
  type ProposalPreview,
} from "./model/document.ts";
import { EDGE_TYPE_NAME, GRAPH_VIEWS, arcIdsOf, inViewEdge, type EventGraph, type GraphEdge, type GraphSelection, type GraphView } from "./model/buildEventGraph.ts";

const fieldClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent-border";
const areaClass = "min-h-16 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-5 text-foreground outline-none focus:border-accent-border";

type EventGraphInspectorProps = {
  readonly document: GraphDocument;
  readonly graph: EventGraph;
  readonly view: GraphView;
  readonly selection: GraphSelection;
  readonly chapters: readonly ChapterOption[];
  readonly preview: ProposalPreview | null;
  readonly busy: boolean;
  readonly onSelectEdge: (id: string) => void;
  readonly onClear: () => void;
  readonly onSaveNode: (node: GraphNode) => void;
  readonly onCreateNext: (fromId: string, input: NextNodeInput) => void;
  readonly onSaveRelation: (relation: GraphRelation) => void;
  readonly onDeleteRelation: (id: string) => void;
};

export default function EventGraphInspector({
  document,
  graph,
  view,
  selection,
  chapters,
  preview,
  busy,
  onSelectEdge,
  onClear,
  onSaveNode,
  onCreateNext,
  onSaveRelation,
  onDeleteRelation,
}: EventGraphInspectorProps) {
  const viewName = GRAPH_VIEWS.find(([id]) => id === view)?.[1] ?? "";
  const arcs = arcIdsOf(graph);
  const selected = selection?.kind === "nodes"
    ? selection.ids.flatMap((id) => {
        const node = document.nodes.find((item) => item.id === id) ?? preview?.nodes.find((item) => item.id === id);
        return node ? [node] : [];
      })
    : [];
  const edge = selection?.kind === "edge" ? graph.edges.find((item) => item.id === selection.id) : undefined;
  const relation = edge
    ? document.relations.find((item) => item.id === edge.id) ?? preview?.relations.find((item) => item.id === edge.id)
    : undefined;

  return (
    <aside className="min-h-0 overflow-auto border-t border-border bg-card px-4 py-4 lg:border-l lg:border-t-0" aria-label="事件编辑">
      <p className="m-0 text-[11px] font-semibold text-text-subtle">有向图</p>
      <h2 className="m-0 text-lg font-semibold">G = (V, E)</h2>
      <p className="mb-3 mt-1 flex gap-3 text-[13px] text-muted-foreground"><span>|V| = {graph.vertices.length}</span><span>|E| = {graph.edges.length}</span></p>
      {selected.length === 1 && selected[0] && (
        <NodeEditor
          key={`${selected[0].id}:${document.revision}`}
          node={selected[0]}
          document={document}
          chapters={chapters}
          pending={preview?.updatedNodeIds.includes(selected[0].id) ?? false}
          busy={busy}
          onSave={onSaveNode}
          onCreateNext={onCreateNext}
          onClear={onClear}
        />
      )}
      {selected.length > 1 && (
        <div>
          <p className="m-0 text-[11px] font-semibold text-text-subtle">已选 {selected.length} 个节点</p>
          <ul className="my-2 grid gap-1 pl-0 text-[13px]">{selected.map((node) => <li key={node.id} className="truncate">{node.title}</li>)}</ul>
          <p className="text-[13px] leading-6 text-text-secondary">在下方提交框说明要怎么改这几处。手改某一个时，先点回它。</p>
          <button className="mt-2 border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onClear}>清除选择</button>
        </div>
      )}
      {edge && (
        <EdgeEditor
          key={edge.id}
          edge={edge}
          relation={relation}
          graph={graph}
          busy={busy}
          onSave={onSaveRelation}
          onDelete={onDeleteRelation}
          onClear={onClear}
        />
      )}
      {selected.length === 0 && !edge && (
        <div>
          <p className="m-0 text-[11px] font-semibold text-text-subtle">{viewName} · 主边</p>
          <p className="text-[13px] leading-6 text-text-secondary">点一个节点可以编辑。按住 Shift 再点，把多个节点交给提交框。</p>
          {["story", "narrative", "causes", "requires", "reveals", "foreshadows", "contrasts", "contains"].map((type) => {
            const rows = graph.edges.filter((item) => item.type === type && inViewEdge(view, item, arcs));
            if (rows.length === 0) return null;
            return (
              <section key={type}>
                <h3 className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">{EDGE_TYPE_NAME[type] ?? type} · {rows.length}</h3>
                <div className="grid gap-0.5">{rows.map((item) => <EdgeRow key={item.id} edge={item} graph={graph} active={false} onSelect={onSelectEdge} />)}</div>
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function NodeEditor({
  node,
  document,
  chapters,
  pending,
  busy,
  onSave,
  onCreateNext,
  onClear,
}: {
  node: GraphNode;
  document: GraphDocument;
  chapters: readonly ChapterOption[];
  pending: boolean;
  busy: boolean;
  onSave: (node: GraphNode) => void;
  onCreateNext: (fromId: string, input: NextNodeInput) => void;
  onClear: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary);
  const [goal, setGoal] = useState(node.goal);
  const [conflict, setConflict] = useState(node.conflict);
  const [outcome, setOutcome] = useState(node.outcome);
  const [timeText, setTimeText] = useState(node.timeText);
  const [locationText, setLocationText] = useState(node.locationText);
  const [notes, setNotes] = useState(node.notes);
  const [storyOrder, setStoryOrder] = useState(String(node.storyOrder));
  const [narrativeOrder, setNarrativeOrder] = useState(String(node.narrativeOrder));
  const [status, setStatus] = useState<OutlineNodeStatus>(node.status);
  const [narrativeFunction, setNarrativeFunction] = useState<OutlineNarrativeFunction>(node.narrativeFunction);
  const [parentId, setParentId] = useState(node.parentId ?? "");
  const [chapterId, setChapterId] = useState(node.chapterId ?? "");
  const [participants, setParticipants] = useState<GraphParticipant[]>([...node.participants]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = node.proposal;
  const descendants = descendantIds(document, node.id);
  const parents = document.nodes.filter((item) => item.id !== node.id && !descendants.has(item.id));

  const save = () => {
    if (title.trim() === "") {
      setError("节点需要标题");
      return;
    }
    if (participants.some((person) => person.name.trim() === "" && (person.stateBefore.trim() !== "" || person.stateAfter.trim() !== ""))) {
      setError("人物需要名字");
      return;
    }
    const story = Number(storyOrder);
    const narrative = Number(narrativeOrder);
    if (!Number.isInteger(story) || !Number.isInteger(narrative)) {
      setError("故事序和叙事序要是整数");
      return;
    }
    setError(null);
    onSave({
      ...node,
      title: title.trim(),
      summary,
      goal,
      conflict,
      outcome,
      timeText,
      locationText,
      notes,
      storyOrder: story,
      narrativeOrder: narrative,
      status,
      narrativeFunction,
      parentId: parentId === "" ? null : parentId,
      chapterId: chapterId === "" ? null : chapterId,
      participants: participants.filter((person) => person.name.trim() !== ""),
      proposal: false,
    });
  };

  return (
    <div className="grid gap-2">
      <p className="m-0 text-[11px] font-semibold text-text-subtle">{node.kind === "arc" ? "故事弧" : "事件"} · {NODE_STATUS_LABEL[node.status]}</p>
      {blocked && <p className="m-0 text-xs leading-5 text-text-secondary">这是候选节点。接受这版候选后才能修改。</p>}
      {pending && <p className="m-0 text-xs leading-5 text-warning-text">候选会修改这个节点。</p>}
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">标题<input className={fieldClass} value={title} disabled={blocked} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">摘要<textarea className={areaClass} value={summary} disabled={blocked} onChange={(event) => setSummary(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">目标<textarea className={areaClass} value={goal} disabled={blocked} onChange={(event) => setGoal(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">冲突<textarea className={areaClass} value={conflict} disabled={blocked} onChange={(event) => setConflict(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">结果<textarea className={areaClass} value={outcome} disabled={blocked} onChange={(event) => setOutcome(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">时间<input className={fieldClass} value={timeText} disabled={blocked} onChange={(event) => setTimeText(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">地点<input className={fieldClass} value={locationText} disabled={blocked} onChange={(event) => setLocationText(event.target.value)} /></label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">叙事功能
        <select className={fieldClass} value={narrativeFunction} disabled={blocked} onChange={(event) => setNarrativeFunction(event.target.value as OutlineNarrativeFunction)}>
          {Object.entries(NARRATIVE_FUNCTION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">故事序<input className={fieldClass} inputMode="numeric" value={storyOrder} disabled={blocked} onChange={(event) => setStoryOrder(event.target.value)} /></label>
        <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">叙事序<input className={fieldClass} inputMode="numeric" value={narrativeOrder} disabled={blocked} onChange={(event) => setNarrativeOrder(event.target.value)} /></label>
      </div>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">状态
        <select className={fieldClass} value={status} disabled={blocked} onChange={(event) => setStatus(event.target.value as OutlineNodeStatus)}>
          {(["draft", "confirmed"] as const).map((id) => <option key={id} value={id}>{NODE_STATUS_LABEL[id]}</option>)}
          {status !== "draft" && status !== "confirmed" && <option value={status}>{NODE_STATUS_LABEL[status]}</option>}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">父节点
        <select className={fieldClass} value={parentId} disabled={blocked} onChange={(event) => setParentId(event.target.value)}>
          <option value="">无</option>
          {parents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {isLeaf(document, node.id) && (
        <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">章节
          <select className={fieldClass} value={chapterId} disabled={blocked} onChange={(event) => setChapterId(event.target.value)}>
            <option value="">未映射</option>
            {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.label}</option>)}
          </select>
        </label>
      )}
      <div>
        <p className="m-0 text-[11px] font-semibold text-text-subtle">人物</p>
        {participants.map((person, index) => (
          <div key={`${node.id}-${index}`} className="mt-1 grid gap-1">
            <input className={fieldClass} value={person.name} placeholder="名字" disabled={blocked} onChange={(event) => setParticipants(replacePerson(participants, index, { ...person, name: event.target.value }))} />
            <select className={fieldClass} value={person.role} disabled={blocked} onChange={(event) => setParticipants(replacePerson(participants, index, { ...person, role: event.target.value as OutlineParticipantRole }))}>
              {Object.entries(PARTICIPANT_ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <input className={fieldClass} value={person.stateBefore} placeholder="事件前" disabled={blocked} onChange={(event) => setParticipants(replacePerson(participants, index, { ...person, stateBefore: event.target.value }))} />
            <input className={fieldClass} value={person.stateAfter} placeholder="事件后" disabled={blocked} onChange={(event) => setParticipants(replacePerson(participants, index, { ...person, stateAfter: event.target.value }))} />
            <button className="justify-self-start border-0 bg-transparent p-0 text-xs text-text-subtle" type="button" disabled={blocked} onClick={() => setParticipants(participants.filter((_, item) => item !== index))}>移除</button>
          </div>
        ))}
        <button className="mt-1 border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" disabled={blocked} onClick={() => setParticipants([...participants, { name: "", role: "active", stateBefore: "", stateAfter: "" }])}>添加人物</button>
      </div>
      <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">备注<textarea className={areaClass} value={notes} disabled={blocked} onChange={(event) => setNotes(event.target.value)} /></label>
      {error && <p className="m-0 text-xs text-danger-text" role="alert">{error}</p>}
      <button className="h-8 rounded-lg border border-border bg-background text-xs disabled:opacity-40" type="button" disabled={blocked || busy} onClick={save}>保存节点</button>
      {!blocked && (
        <button className="h-8 rounded-lg border border-border bg-background text-xs" type="button" onClick={() => setCreating((value) => !value)}>{creating ? "收起下一节点" : "下一节点"}</button>
      )}
      {creating && <NextNodeForm busy={busy} onCreate={(input) => onCreateNext(node.id, input)} />}
      <button className="justify-self-start border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onClear}>回到这一层</button>
    </div>
  );
}

function NextNodeForm({ busy, onCreate }: { busy: boolean; onCreate: (input: NextNodeInput) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [goal, setGoal] = useState("");
  const [conflict, setConflict] = useState("");
  const [outcome, setOutcome] = useState("");
  const [timeText, setTimeText] = useState("");
  const [locationText, setLocationText] = useState("");
  const [link, setLink] = useState<NextNodeInput["link"]>("sibling");
  const [relationType, setRelationType] = useState<OutlineRelationType | "">("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2 rounded-lg border border-border p-2">
      <p className="m-0 text-[11px] font-semibold text-text-subtle">新节点</p>
      <input className={fieldClass} value={title} placeholder="标题" onChange={(event) => setTitle(event.target.value)} />
      <textarea className={areaClass} value={summary} placeholder="摘要" onChange={(event) => setSummary(event.target.value)} />
      <textarea className={areaClass} value={goal} placeholder="目标" onChange={(event) => setGoal(event.target.value)} />
      <textarea className={areaClass} value={conflict} placeholder="冲突" onChange={(event) => setConflict(event.target.value)} />
      <textarea className={areaClass} value={outcome} placeholder="结果" onChange={(event) => setOutcome(event.target.value)} />
      <input className={fieldClass} value={timeText} placeholder="时间" onChange={(event) => setTimeText(event.target.value)} />
      <input className={fieldClass} value={locationText} placeholder="地点" onChange={(event) => setLocationText(event.target.value)} />
      <select className={fieldClass} value={link} onChange={(event) => setLink(event.target.value as NextNodeInput["link"])}>
        <option value="sibling">同级下一拍</option>
        <option value="child">包含为子事件</option>
      </select>
      <select className={fieldClass} value={relationType} onChange={(event) => setRelationType(event.target.value as OutlineRelationType | "")}>
        <option value="">不连语义边</option>
        {Object.entries(RELATION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {relationType !== "" && (
        <>
          <select className={fieldClass} value={direction} onChange={(event) => setDirection(event.target.value as "out" | "in")}>
            <option value="out">从当前节点指向新节点</option>
            <option value="in">从新节点指向当前节点</option>
          </select>
          <input className={fieldClass} value={description} placeholder="这条边的说明" onChange={(event) => setDescription(event.target.value)} />
        </>
      )}
      {error && <p className="m-0 text-xs text-danger-text" role="alert">{error}</p>}
      <button
        className="h-8 rounded-lg border border-border bg-background text-xs disabled:opacity-40"
        type="button"
        disabled={busy}
        onClick={() => {
          if (title.trim() === "") {
            setError("新节点需要标题");
            return;
          }
          setError(null);
          onCreate({
            title,
            summary,
            goal,
            conflict,
            outcome,
            timeText,
            locationText,
            participants: [],
            link,
            relation: relationType === "" ? null : { type: relationType, description, direction },
          });
        }}
      >创建</button>
    </div>
  );
}

function EdgeEditor({
  edge,
  relation,
  graph,
  busy,
  onSave,
  onDelete,
  onClear,
}: {
  edge: GraphEdge;
  relation: GraphRelation | undefined;
  graph: EventGraph;
  busy: boolean;
  onSave: (relation: GraphRelation) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const derived = edge.type === "contains" || edge.type === "story" || edge.type === "narrative";
  const [type, setType] = useState<OutlineRelationType>(relation?.type ?? "causes");
  const [description, setDescription] = useState(relation?.description ?? edge.detail ?? "");
  const [orderException, setOrderException] = useState(relation?.orderException ?? false);
  return (
    <div className="grid gap-2">
      <p className="m-0 text-[11px] font-semibold text-text-subtle">边</p>
      <EdgeRow edge={edge} graph={graph} active onSelect={() => undefined} />
      {derived && <p className="m-0 text-[13px] leading-6 text-text-secondary">这条{EDGE_TYPE_NAME[edge.type] ?? edge.type}由节点的父子或顺序生成。改父节点、故事序或叙事序，边会跟着变。</p>}
      {relation?.proposal && <p className="m-0 text-xs leading-5 text-text-secondary">这是候选边。接受这版候选后才能修改。</p>}
      {relation && !relation.proposal && !derived && (
        <>
          <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">类型
            <select className={fieldClass} value={type} onChange={(event) => setType(event.target.value as OutlineRelationType)}>
              {Object.entries(RELATION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] font-semibold text-text-subtle">说明<textarea className={areaClass} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={orderException} onChange={(event) => setOrderException(event.target.checked)} />允许和叙述顺序不一致</label>
          <button className="h-8 rounded-lg border border-border bg-background text-xs disabled:opacity-40" type="button" disabled={busy} onClick={() => onSave({ ...relation, type, description, orderException })}>保存边</button>
          <button className="h-8 rounded-lg border border-destructive text-xs text-destructive disabled:opacity-40" type="button" disabled={busy} onClick={() => onDelete(relation.id)}>删除边</button>
        </>
      )}
      <button className="justify-self-start border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onClear}>回到这一层</button>
    </div>
  );
}

function EdgeRow({ edge, graph, active, onSelect }: { edge: GraphEdge; graph: EventGraph; active: boolean; onSelect: (id: string) => void }) {
  const name = (id: string) => graph.vertices.find((vertex) => vertex.id === id)?.name ?? id;
  return (
    <button className={active ? "grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-lg bg-accent px-1 py-1.5 text-left text-[13px] text-accent-foreground" : "grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-lg border-0 bg-transparent px-1 py-1.5 text-left text-[13px] hover:bg-muted"} type="button" onClick={() => onSelect(edge.id)}>
      <b className="truncate font-semibold">{name(edge.from)}</b>
      <i className="text-[11px] not-italic text-text-subtle">{edge.label}</i>
      <b className="truncate text-right font-semibold">{name(edge.to)}</b>
    </button>
  );
}

function replacePerson(people: readonly GraphParticipant[], index: number, next: GraphParticipant): GraphParticipant[] {
  return people.map((person, item) => (item === index ? next : person));
}
