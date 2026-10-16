import { Maximize2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils.ts";
import type { DetailRelation } from "./model/eventBrief.ts";
import { relationLabel } from "./model/storyDocument.ts";
import {
  ancestorArcId,
  isMainlineCard,
  narrativeJump,
  spineLanes,
  type SpineItem,
} from "./model/spine.ts";

const CARD_W = 198;
const CARD_H = 112;
const COLUMN_W = 246;
const STAGE_GAP = 44;
const STAGE_PADDING = 32;
const STAGE_MIN_W = 294;
const FIRST_ROW_Y = 76;
const SECOND_ROW_Y = 230;
const WORLD_H = SECOND_ROW_Y + CARD_H + 24;
const STAGE_BRACE_H = 88;

type SavedPosition = {
  readonly arcId: string | null;
  readonly offsetX: number;
  readonly y: number;
};

type SavedLayout = Readonly<Record<string, SavedPosition>>;

type PlacedStage = {
  readonly arcId: string | null;
  readonly title: string;
  readonly index: number;
  readonly x: number;
  readonly width: number;
  readonly count: number;
};

type PlacedCard = SpineItem & {
  readonly stage: number;
  readonly x: number;
  readonly y: number;
  readonly reading: number;
  readonly arcId: string | null;
};

type EventGraphSpineProps = {
  readonly projectId: string;
  readonly nodes: readonly SpineItem[];
  readonly chapterLabels: ReadonlyMap<string, string>;
  readonly chapter: string;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onPlace: (id: string, orderedIds: readonly string[], parentId: string | null) => void;
  readonly onInsertAfter: (id: string) => void;
  readonly onAddEvent: (stageId: string) => void;
  readonly onCreateBlank?: () => void;
  readonly onRemove: (id: string) => void;
  readonly relations: readonly DetailRelation[];
  readonly onClear: () => void;
};

export default function EventGraphSpine({
  projectId,
  nodes,
  chapterLabels,
  chapter,
  selectedId,
  onSelect,
  onPlace,
  onInsertAfter,
  onAddEvent,
  onCreateBlank,
  onRemove,
  relations,
  onClear,
}: EventGraphSpineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const [savedLayout, setSavedLayout] = useState<SavedLayout>(() => readLayout(projectId));
  const [pan, setPan] = useState({ x: 24, y: 56, scale: 1 });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; stage: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const lanes = spineLanes(nodes);
  const { stages, cards, width } = placeCards(nodes, lanes, savedLayout);
  const height = Math.max(WORLD_H, ...cards.map((card) => card.y + CARD_H + 24));
  const path = cards.slice(1).map((card, index) => {
    const previous = cards[index];
    if (!previous) return null;
    return {
      key: `${previous.id}:${card.id}`,
      from: previous,
      to: card,
      jump: narrativeJump(previous.storyOrder, card.storyOrder),
    };
  }).filter((edge) => edge !== null);
  const frames = sceneFrames(nodes, cards);
  const semanticPaths = selectedId ? relations.flatMap((relation) => {
    if (relation.from !== selectedId && relation.to !== selectedId) return [];
    const from = cards.find((card) => card.id === relation.from);
    const to = cards.find((card) => card.id === relation.to);
    return from && to ? [{ relation, from, to }] : [];
  }) : [];

  const clampPan = (x: number, y: number, scale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x, y, scale };
    const view = viewport.getBoundingClientRect();
    const limit = (position: number, viewSize: number, contentSize: number, leading: number, trailing: number) => {
      const size = contentSize * scale;
      if (size + leading + trailing <= viewSize) return clamp(position, leading, viewSize - size - trailing);
      return clamp(position, viewSize - size - trailing, leading);
    };
    return {
      scale,
      x: limit(x, view.width, width, 24, 24),
      y: limit(y, view.height, height, 56, STAGE_BRACE_H + 18),
    };
  };

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const scale = Math.min((rect.width - 48) / width, (rect.height - STAGE_BRACE_H - 74) / height, 1);
    const nextScale = Math.max(scale, 0.55);
    setPan(clampPan(Math.max(24, (rect.width - width * nextScale) / 2), 56, nextScale));
  };

  useEffect(() => {
    if (openedRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.height < 40) return;
    openedRef.current = true;
    const scale = Math.max(0.65, Math.min(1, (rect.height - STAGE_BRACE_H - 74) / height));
    setPan(clampPan(Math.max(24, (rect.width - width * scale) / 2), 56, scale));
  }, [height]);

  const worldPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / pan.scale,
      y: (clientY - rect.top - pan.y) / pan.scale,
    };
  };

  return (
    <div
      ref={viewportRef}
      className="relative min-h-0 flex-1 cursor-grab select-none overflow-hidden bg-surface-canvas active:cursor-grabbing"
      aria-label="事件图"
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("[data-card], [data-add], [data-remove], [data-stage]")) return;
        event.preventDefault();
        const start = { x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y, moved: false };
        bindPointer(event.pointerId, (next) => {
          if (Math.hypot(next.clientX - start.x, next.clientY - start.y) > 3) start.moved = true;
          setPan((current) => clampPan(start.ox + next.clientX - start.x, start.oy + next.clientY - start.y, current.scale));
        }, () => {
          if (!start.moved) onClear();
        });
      }}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("[data-card], [data-stage], [data-remove], [data-add]")) return;
        fit();
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface-canvas/95 px-5">
        <div className="min-w-0">
          <h2 className="m-0 text-sm font-semibold text-foreground">主线脉络</h2>
          <p className="m-0 text-[11px] text-text-secondary">沿讲述顺序阅读 · {stages.filter((stage) => stage.arcId).length} 个阶段 · {cards.length} 个事件</p>
        </div>
        <button
          type="button"
          data-add=""
          className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-text-secondary hover:border-border-strong hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); fit(); }}
        ><Maximize2 size={13} />适应画布</button>
      </div>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`, width, height }}>
        {stages.length === 0 && (
          <div className="absolute left-6 top-20 flex items-center gap-5">
            <p className="m-0 max-w-44 text-sm leading-6 text-text-secondary">先放下第一个关键事件，故事会从左向右展开。</p>
            <button
              type="button"
              data-add=""
              className="grid place-items-center rounded-xl border border-dashed border-border-strong bg-card text-sm text-text-secondary hover:border-accent-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{ width: CARD_W, height: CARD_H }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onCreateBlank?.(); }}
            >+ 新建空白事件</button>
          </div>
        )}
        {stages.filter((stage) => stage.arcId && stage.count === 0).map((stage) => (
          <button
            key={`${stage.arcId}:add`}
            type="button"
            data-add=""
            className="absolute grid place-items-center rounded-xl border border-dashed border-border-strong bg-card text-sm text-text-secondary hover:border-accent-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ left: stage.x + STAGE_PADDING, top: FIRST_ROW_Y, width: CARD_W, height: CARD_H }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onAddEvent(stage.arcId ?? ""); }}
          >+ 在此阶段添加事件</button>
        ))}
        <svg className="absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden="true">
          <defs><marker id="event-graph-relation-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M 0 1 L 7 4 L 0 7" fill="none" stroke="var(--app-accent-foreground)" strokeWidth="1.5" /></marker></defs>
          {path.map((edge) => {
            const line = link(edge.from, edge.to, drag);
            return (
              <g key={edge.key}>
                <path d={line.d} fill="none" stroke={edge.jump === "倒叙" ? "var(--app-accent-foreground)" : "var(--app-border-strong)"} strokeWidth={edge.jump ? 2.2 : 2} strokeLinecap="round" strokeDasharray={edge.jump === "预叙" ? "5 4" : undefined} />
              </g>
            );
          })}
          {semanticPaths.map(({ relation, from, to }) => <path key={relation.id} d={link(from, to, drag).d} fill="none" stroke="var(--app-accent-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={relation.type === "foreshadows" ? "6 5" : undefined} markerEnd="url(#event-graph-relation-arrow)" />)}
        </svg>
        {semanticPaths.map(({ relation, from, to }) => <span key={`${relation.id}:label`} className="pointer-events-none absolute z-[1] -translate-x-1/2 rounded-full border border-accent-border bg-card px-2 py-0.5 text-[10px] font-semibold text-accent-foreground" style={{ left: link(from, to, drag).lx, top: link(from, to, drag).ly }}>{relationLabel(relation.type)}</span>)}
        {frames.map((frame) => (
          <div
            key={frame.id}
            className="pointer-events-none absolute rounded-2xl border border-dashed border-accent-border"
            style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
          >
              <span className="absolute left-2 top-1 text-[10px] text-text-secondary">场景 · {frame.title}</span>
          </div>
        ))}
        {path.map((edge) => edge.jump && (
          <span
            key={`${edge.key}:jump`}
            className={cn(
              "pointer-events-none absolute -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              edge.jump === "倒叙" ? "bg-warning-surface text-warning-text" : "bg-accent text-accent-foreground",
            )}
            style={{ left: link(edge.from, edge.to, drag).lx, top: link(edge.from, edge.to, drag).ly }}
          >{edge.jump}</span>
        ))}
        {cards.map((card) => {
          const at = drag?.id === card.id ? { x: drag.x, y: drag.y } : { x: card.x, y: card.y };
          const chapterIds = card.chapterIds?.length ? card.chapterIds : card.chapterId ? [card.chapterId] : [];
          const chapterLabel = chapterIds.map((id) => chapterLabels.get(id) ?? id).join("、") || undefined;
          const dim = chapter !== "all" && !chapterIds.includes(chapter);
          const active = card.id === hoverId || card.id === selectedId;
          const removable = !card.proposal;
          return (
            <div
              key={card.id}
              data-card={card.id}
              role="button"
              tabIndex={0}
              aria-label={`${card.title}，讲述 ${card.reading}，故事 ${card.storyOrder + 1}`}
              aria-pressed={card.id === selectedId}
              className={cn(
                "absolute rounded-xl border bg-card px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                card.id === selectedId ? "border-accent-foreground ring-1 ring-accent-border" : "border-border-strong hover:border-accent-border",
                card.proposal && "border-dashed bg-accent/20",
                dim && "opacity-40",
                drag?.id === card.id ? "z-10 cursor-grabbing" : "cursor-grab",
              )}
              style={{ left: at.x, top: at.y, width: CARD_W, height: CARD_H }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(card.id);
                }
              }}
              onPointerEnter={() => setHoverId(card.id)}
              onPointerLeave={() => setHoverId((current) => (current === card.id ? null : current))}
              onPointerDown={(event) => {
                if ((event.target as Element).closest("[data-add], [data-remove]")) return;
                event.preventDefault();
                event.stopPropagation();
                if (card.proposal || event.button !== 0) {
                  onSelect(card.id);
                  return;
                }
                const origin = worldPoint(event.clientX, event.clientY);
                const home = { x: card.x, y: card.y };
                const offset = { x: origin.x - home.x, y: origin.y - home.y };
                let moved = false;
                bindPointer(event.pointerId, (next) => {
                  const point = worldPoint(next.clientX, next.clientY);
                  if (Math.hypot(point.x - origin.x, point.y - origin.y) <= 4 && !moved) return;
                  moved = true;
                  const x = Math.max(0, point.x - offset.x);
                  const y = Math.max(56, point.y - offset.y);
                  setDrag({
                    id: card.id,
                    x,
                    y,
                    stage: stageAt(x + CARD_W / 2, stages),
                  });
                }, (next) => {
                  const point = worldPoint(next.clientX, next.clientY);
                  setDrag(null);
                  if (!moved) {
                    onSelect(card.id);
                    return;
                  }
                  const x = Math.max(0, point.x - offset.x);
                  const y = Math.max(56, point.y - offset.y);
                  const center = { x: x + CARD_W / 2, y: y + CARD_H / 2 };
                  const nextStage = stages[stageAt(center.x, stages)];
                  const nextArcId = nextStage?.arcId ?? null;
                  const nextLayout = {
                    ...savedLayout,
                    [card.id]: { arcId: nextArcId, offsetX: x - (nextStage?.x ?? 0), y },
                  };
                  setSavedLayout(nextLayout);
                  writeLayout(projectId, nextLayout);
                  if (nextArcId !== card.arcId) {
                    onPlace(card.id, orderAtDrop(cards, card.id, nextStage?.index ?? card.stage, center), nextArcId);
                  }
                });
              }}
            >
              <span className="block text-[11px] font-medium text-accent-foreground">讲述 {card.reading}{card.kind !== "event" ? ` · ${kindLabel(card.kind)}` : ""}{card.proposal ? " · 待确认" : ""}</span>
              <span className="mt-1 block line-clamp-2 text-[13px] font-semibold leading-5 text-foreground">{card.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-text-secondary">{card.changeAfter || "补上这次变化"}</span>
              <span className="absolute bottom-2.5 left-3 right-3 flex gap-2 border-t border-border pt-1.5 text-[10px] text-text-secondary">
                <span className="tabular-nums">故事 {card.storyOrder + 1}</span>
                {chapterLabel && <span className="truncate">{chapterLabel}</span>}
              </span>
              {active && !card.proposal && !drag && (
                <button
                  type="button"
                  data-add=""
                  className="absolute top-1/2 -right-3 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border-strong bg-card text-sm leading-none text-foreground hover:border-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`在${card.title}之后添加事件`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onInsertAfter(card.id);
                  }}
                >+</button>
              )}
              {card.id === selectedId && removable && !drag && (
                <button
                  type="button"
                  data-remove=""
                  className="absolute -top-2 right-2 h-5 rounded-full border border-danger-border bg-danger-surface px-1.5 text-[10px] text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`删除${card.title}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(card.id);
                  }}
                >删除</button>
              )}
            </div>
          );
        })}
      </div>
      <nav
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[88px] overflow-hidden"
        aria-label="故事阶段"
        data-stage=""
      >
        {stages.length === 0 && <p className="m-0 px-6 py-9 text-xs text-text-secondary">添加阶段后，阶段范围会显示在这里。</p>}
        {stages.map((stage) => {
          const stageWidth = stage.width * pan.scale;
          const active = drag?.stage === stage.index || (stage.arcId !== null && selectedId === stage.arcId);
          return (
          <div
            key={stage.arcId ?? "loose"}
            className="group absolute top-0 h-full"
            style={{ left: pan.x + stage.x * pan.scale, width: stageWidth }}
          >
            <svg className="block h-10 w-full" viewBox={`0 0 ${stageWidth} 40`} aria-hidden="true">
              <path d={stageBrace(stageWidth)} fill="none" stroke={active ? "var(--app-accent-foreground)" : "var(--app-text-secondary)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {stage.arcId ? (
              <button
                type="button"
                data-stage=""
                className="pointer-events-auto absolute inset-x-2 top-10 min-w-0 rounded-md border-0 bg-transparent px-2 py-1 text-center hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-pressed={selectedId === stage.arcId}
                onClick={() => onSelect(stage.arcId ?? "")}
              >
                <span className="block truncate text-sm font-semibold">{stage.title}</span>
                <span className="block text-[10px] text-text-secondary">阶段 {stage.index + 1} · {stage.count} 个事件</span>
              </button>
            ) : (
              <div className="px-3 py-1 text-center">
                <span className="block truncate text-sm font-semibold">{stage.title}</span>
                <span className="block text-[10px] text-text-secondary">待归入 · {stage.count} 个事件</span>
              </div>
            )}
            {stage.arcId && (
              <button
                type="button"
                data-remove=""
                className={cn("pointer-events-auto absolute right-2 top-12 grid size-6 place-items-center rounded-md text-text-secondary hover:bg-danger-surface hover:text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", selectedId === stage.arcId ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                aria-label={`删除阶段「${stage.title}」`}
                onClick={() => onRemove(stage.arcId ?? "")}
              ><Trash2 size={14} /></button>
            )}
          </div>
          );
        })}
      </nav>
      <p className="pointer-events-none absolute bottom-[94px] left-5 m-0 rounded-md bg-surface-canvas/90 px-2 py-1 text-[11px] text-text-secondary">节点可在画布中自由摆放 · 跨过阶段范围可调整归属</p>
    </div>
  );
}

function placeCards(nodes: readonly SpineItem[], lanes: readonly { readonly arcId: string | null; readonly title: string }[], savedLayout: SavedLayout) {
  const ordered = nodes
    .filter((node) => isMainlineCard(node, nodes))
    .slice()
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.storyOrder - right.storyOrder || left.id.localeCompare(right.id));
  const arcOf = new Map(ordered.map((node) => [node.id, ancestorArcId(node.id, nodes)]));
  const relative = new Map<string, { offsetX: number; y: number }>();
  let nextX = 24;
  const stages: PlacedStage[] = lanes.map((lane, index) => {
    const members = ordered.filter((node) => arcOf.get(node.id) === lane.arcId);
    const occupied: { offsetX: number; y: number }[] = members.flatMap((node) => {
      const saved = savedLayout[node.id];
      return saved && saved.arcId === lane.arcId ? [{ offsetX: saved.offsetX, y: saved.y }] : [];
    });
    let slot = 0;
    for (const node of members) {
      const saved = savedLayout[node.id];
      if (saved && saved.arcId === lane.arcId) {
        relative.set(node.id, { offsetX: saved.offsetX, y: saved.y });
        continue;
      }
      let candidate: { offsetX: number; y: number };
      do {
        candidate = {
          offsetX: STAGE_PADDING + Math.floor(slot / 2) * COLUMN_W,
          y: slot % 2 === 0 ? FIRST_ROW_Y : SECOND_ROW_Y,
        };
        slot += 1;
      } while (occupied.some((position) => Math.abs(position.offsetX - candidate.offsetX) < CARD_W + 12 && Math.abs(position.y - candidate.y) < CARD_H + 12));
      relative.set(node.id, candidate);
      occupied.push(candidate);
    }
    const right = Math.max(STAGE_PADDING + CARD_W, ...occupied.map((position) => position.offsetX + CARD_W));
    const width = Math.max(STAGE_MIN_W, right + STAGE_PADDING);
    const stage = { ...lane, index, x: nextX, width, count: members.length };
    nextX += width + STAGE_GAP;
    return stage;
  });
  const stageIndex = new Map(stages.map((stage) => [stage.arcId, stage.index]));
  const cards: PlacedCard[] = ordered.map((node, index) => {
    const arcId = arcOf.get(node.id) ?? null;
    const stage = stageIndex.get(arcId) ?? 0;
    const position = relative.get(node.id) ?? { offsetX: STAGE_PADDING, y: FIRST_ROW_Y };
    return {
      ...node,
      arcId,
      stage,
      x: (stages[stage]?.x ?? 24) + position.offsetX,
      y: position.y,
      reading: index + 1,
    };
  });
  return { stages, cards, width: stages.length > 0 ? nextX - STAGE_GAP + 24 : 460 };
}

function sceneFrames(nodes: readonly SpineItem[], cards: readonly PlacedCard[]) {
  const scenes = nodes.filter((node) => node.kind === "scene");
  return scenes.flatMap((scene) => {
    const members = cards.filter((card) => card.parentId === scene.id);
    if (members.length < 2) return [];
    const left = Math.min(...members.map((card) => card.x)) - 8;
    const right = Math.max(...members.map((card) => card.x)) + CARD_W + 8;
    const top = Math.min(...members.map((card) => card.y)) - 16;
    const bottom = Math.max(...members.map((card) => card.y)) + CARD_H + 8;
    return [{ id: scene.id, title: scene.title, x: left, y: top, width: right - left, height: bottom - top }];
  });
}

function link(from: PlacedCard, to: PlacedCard, drag: { id: string; x: number; y: number } | null) {
  const fromAt = drag?.id === from.id ? drag : from;
  const toAt = drag?.id === to.id ? drag : to;
  if (Math.abs(fromAt.x - toAt.x) < CARD_W / 2) {
    const down = toAt.y > fromAt.y;
    const x1 = fromAt.x + CARD_W / 2;
    const y1 = fromAt.y + (down ? CARD_H : 0);
    const x2 = toAt.x + CARD_W / 2;
    const y2 = toAt.y + (down ? 0 : CARD_H);
    const bend = down ? 18 : -18;
    return {
      d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
      lx: (x1 + x2) / 2 + 12,
      ly: (y1 + y2) / 2 - 8,
    };
  }
  const forward = toAt.x > fromAt.x;
  const x1 = fromAt.x + (forward ? CARD_W : 0);
  const y1 = fromAt.y + CARD_H / 2;
  const x2 = toAt.x + (forward ? 0 : CARD_W);
  const y2 = toAt.y + CARD_H / 2;
  const bend = forward ? 32 : -32;
  return {
    d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
    lx: (x1 + x2) / 2,
    ly: (y1 + y2) / 2 - 6,
  };
}

function kindLabel(kind: SpineItem["kind"]): string {
  if (kind === "scene") return "场景";
  if (kind === "beat") return "情节点";
  return "事件";
}

function stageAt(x: number, stages: readonly PlacedStage[]): number {
  for (const stage of stages) {
    if (x < stage.x + stage.width + STAGE_GAP / 2) return stage.index;
  }
  return Math.max(stages.length - 1, 0);
}

function orderAtDrop(cards: readonly PlacedCard[], movingId: string, stage: number, point: { x: number; y: number }): readonly string[] {
  const remaining = cards.filter((card) => card.id !== movingId);
  const inStage = remaining.filter((card) => card.stage === stage);
  const ordered = remaining.map((card) => card.id);
  if (inStage.length === 0) {
    const later = remaining.findIndex((card) => card.stage > stage);
    ordered.splice(later < 0 ? ordered.length : later, 0, movingId);
    return ordered;
  }
  const nearest = inStage.reduce((best, card) => {
    const distance = Math.hypot(point.x - card.x - CARD_W / 2, point.y - card.y - CARD_H / 2);
    const bestDistance = Math.hypot(point.x - best.x - CARD_W / 2, point.y - best.y - CARD_H / 2);
    return distance < bestDistance ? card : best;
  });
  const dx = point.x - nearest.x - CARD_W / 2;
  const dy = point.y - nearest.y - CARD_H / 2;
  const after = Math.abs(dx) > CARD_W / 3 ? dx > 0 : dy > 0;
  ordered.splice(ordered.indexOf(nearest.id) + (after ? 1 : 0), 0, movingId);
  return ordered;
}

function stageBrace(width: number): string {
  const middle = width / 2;
  return `M 7 4 C 7 19 17 19 30 19 L ${middle - 24} 19 C ${middle - 8} 19 ${middle - 9} 36 ${middle} 36 C ${middle + 9} 36 ${middle + 8} 19 ${middle + 24} 19 L ${width - 30} 19 C ${width - 17} 19 ${width - 7} 19 ${width - 7} 4`;
}

function readLayout(projectId: string): SavedLayout {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`storyos.event-graph.layout.${projectId}`);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 || !("positions" in parsed)) return {};
    const positions = parsed.positions;
    if (!positions || typeof positions !== "object" || Array.isArray(positions)) return {};
    const valid: Record<string, SavedPosition> = {};
    for (const [id, value] of Object.entries(positions)) {
      if (!value || typeof value !== "object" || !("arcId" in value) || !("offsetX" in value) || !("y" in value)) continue;
      if (value.arcId !== null && typeof value.arcId !== "string") continue;
      if (typeof value.offsetX !== "number" || !Number.isFinite(value.offsetX) || Math.abs(value.offsetX) > 50_000) continue;
      if (typeof value.y !== "number" || !Number.isFinite(value.y) || value.y < 0 || value.y > 50_000) continue;
      valid[id] = { arcId: value.arcId, offsetX: value.offsetX, y: value.y };
    }
    return valid;
  } catch {
    return {};
  }
}

function writeLayout(projectId: string, layout: SavedLayout): void {
  try {
    window.localStorage.setItem(`storyos.event-graph.layout.${projectId}`, JSON.stringify({ version: 1, positions: layout }));
  } catch {
    // 画布位置在当前会话仍可使用；本地存储不可用时只失去重启后的摆放。
  }
}

function bindPointer(
  pointerId: number,
  onMove: (event: PointerEvent) => void,
  onEnd: (event: PointerEvent) => void,
) {
  let ended = false;
  const finish = (event: PointerEvent) => {
    if (ended || event.pointerId !== pointerId) return;
    ended = true;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    onEnd(event);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    onMove(event);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
