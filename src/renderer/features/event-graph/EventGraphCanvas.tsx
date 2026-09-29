import { useEffect, useRef } from "react";
import { VIEW_LEGEND, type DrawEdge, type Emphasis, type GraphVertex, type GraphView } from "./model/buildEventGraph.ts";
import { cn } from "../../../lib/utils.ts";

type Pan = { readonly x: number; readonly y: number; readonly scale: number };

type EventGraphCanvasProps = {
  readonly view: GraphView;
  readonly vertices: readonly (GraphVertex & { readonly emphasis: Emphasis; readonly chosen: boolean })[];
  readonly edges: readonly DrawEdge[];
  readonly width: number;
  readonly height: number;
  readonly frameKey: string;
  readonly pan: Pan;
  readonly onPan: (pan: Pan) => void;
  readonly onSelectVertex: (id: string, shiftKey: boolean) => void;
  readonly onMoveVertex: (id: string, point: { x: number; y: number }) => void;
  readonly onSelectEdge: (id: string) => void;
  readonly onClear: () => void;
};

export default function EventGraphCanvas({
  view,
  vertices,
  edges,
  width,
  height,
  frameKey,
  pan,
  onPan,
  onSelectVertex,
  onMoveVertex,
  onSelectEdge,
  onClear,
}: EventGraphCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  const panRef = useRef(pan);
  panRef.current = pan;

  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const fit = () => {
    const viewport = viewportRef.current;
    const size = sizeRef.current;
    if (!viewport || size.width < 1 || size.height < 1) return;
    const rect = viewport.getBoundingClientRect();
    const scale = Math.min((rect.width - 28) / size.width, (rect.height - 28) / size.height, 1.15);
    const next = Math.max(scale, 0.45);
    onPan({
      scale: next,
      x: (rect.width - size.width * next) / 2,
      y: (rect.height - size.height * next) / 2,
    });
  };

  useEffect(() => {
    movedRef.current = false;
    fit();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (!movedRef.current) fit();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [frameKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = panRef.current;
      const next = Math.min(1.8, Math.max(0.35, current.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      movedRef.current = true;
      onPan({
        scale: next,
        x: px - ((px - current.x) * next) / current.scale,
        y: py - ((py - current.y) * next) / current.scale,
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [onPan]);

  return (
    <div
      ref={viewportRef}
      className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-muted active:cursor-grabbing"
      tabIndex={0}
      aria-label="事件图"
      onPointerDown={(event) => {
        if ((event.target as Element).closest("[data-vertex], [data-edge]")) return;
        const start = { x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        const target = event.currentTarget;
        const move = (next: PointerEvent) => {
          const x = start.ox + next.clientX - start.x;
          const y = start.oy + next.clientY - start.y;
          if (Math.hypot(x - start.ox, y - start.oy) > 3) {
            start.moved = true;
            movedRef.current = true;
          }
          onPan({ x, y, scale: panRef.current.scale });
        };
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
          if (!start.moved) onClear();
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
      }}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("[data-vertex]")) return;
        movedRef.current = true;
        fit();
      }}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`, width, height }}>
        <svg className="absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id="event-graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 1.4 L 9 5 L 0 8.6 Z" fill="context-stroke" />
            </marker>
          </defs>
          {edges.map((edge) => (
            <g key={edge.id} data-edge={edge.id} opacity={edge.opacity} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onSelectEdge(edge.id); }}>
              <path d={edge.d} fill="none" stroke="transparent" strokeWidth="14" />
              <path d={edge.d} fill="none" stroke={edge.color} strokeWidth={edge.width} strokeDasharray={edge.dashed ? "5 4" : undefined} markerEnd="url(#event-graph-arrow)" />
              {edge.label && (
                <g>
                  <rect x={edge.labelX - (edge.label.length * 6 + 7)} y={edge.labelY - 9} width={edge.label.length * 12 + 14} height="18" rx="9" fill="#fbfbfa" stroke={edge.color} />
                  <text x={edge.labelX} y={edge.labelY + 4} textAnchor="middle" fill={edge.color} fontSize="11">{edge.label}</text>
                </g>
              )}
            </g>
          ))}
        </svg>
        {vertices.map((vertex) => (
          <button
            key={vertex.id}
            type="button"
            data-vertex={vertex.id}
            title={vertex.goal}
            className={cn(
              "absolute grid size-20 place-items-center rounded-full border bg-card px-1.5 text-center leading-tight",
              vertex.kind === "arc" ? "border-4 border-double" : "border-[1.5px]",
              vertex.emphasis === "ghost" ? "border-border text-text-secondary opacity-30" : "border-border-strong text-foreground opacity-100",
              vertex.emphasis === "focus" && "z-[2] border-accent text-accent-foreground",
              vertex.chosen && "ring-2 ring-accent",
              vertex.proposal && "border-dashed bg-accent/40",
              vertex.pending && "border-warning-border",
              vertex.transition && "border-warning-border text-warning-text",
            )}
            style={{ left: vertex.x, top: vertex.y, zIndex: vertex.emphasis === "ghost" ? 0 : 2 }}
            aria-pressed={vertex.chosen}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectVertex(vertex.id, event.shiftKey);
              if (event.shiftKey) return;
              const origin = { x: vertex.x, y: vertex.y, clientX: event.clientX, clientY: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
              const target = event.currentTarget;
              const move = (next: PointerEvent) => {
                const scale = panRef.current.scale || 1;
                onMoveVertex(vertex.id, {
                  x: origin.x + (next.clientX - origin.clientX) / scale,
                  y: origin.y + (next.clientY - origin.clientY) / scale,
                });
              };
              const up = () => {
                target.removeEventListener("pointermove", move);
                target.removeEventListener("pointerup", up);
              };
              target.addEventListener("pointermove", move);
              target.addEventListener("pointerup", up);
            }}
          >
            <span className="grid gap-0.5">
              <small className="text-[10px] text-text-subtle">{vertex.proposal ? "候选" : vertex.transition ? "过渡" : vertex.kind === "arc" ? "弧" : vertex.chapter || "事件"}</small>
              <b className="text-xs font-semibold">{vertex.name}</b>
            </span>
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3.5 flex flex-wrap gap-x-3 gap-y-1">
        {VIEW_LEGEND[view].map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <i className={cn("block w-4 border-t-2", item.dashed && "border-dashed")} style={{ borderColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-3 right-3.5 m-0 text-[11px] text-text-subtle">Shift 加选 · 拖动顶点 · 双击复位</p>
    </div>
  );
}
