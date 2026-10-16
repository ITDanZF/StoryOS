// 暂时不挂到事件图页面。故事弧、故事序、叙事序、情节关系恢复时再由 EventGraphPage 接入。
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { VIEW_LEGEND, type DrawEdge, type Emphasis, type GraphVertex, type GraphView } from "./model/buildEventGraph.ts";
import { cn } from "../../../lib/utils.ts";
import EventGraphVertex from "./EventGraphVertex.tsx";

type Pan = { readonly x: number; readonly y: number; readonly scale: number };

export type EventGraphCanvasHandle = {
  fit: () => void;
};

type EventGraphCanvasProps = {
  readonly ref?: Ref<EventGraphCanvasHandle>;
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
  readonly onExtendVertex: (id: string, angle: number) => void;
  readonly onSelectEdge: (id: string) => void;
  readonly onClear: () => void;
};

export default function EventGraphCanvas({
  ref,
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
  onExtendVertex,
  onSelectEdge,
  onClear,
}: EventGraphCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  const panRef = useRef(pan);
  panRef.current = pan;
  const scaleRef = useRef(pan.scale);
  scaleRef.current = pan.scale;

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

  useImperativeHandle(ref, () => ({
    fit: () => {
      movedRef.current = true;
      fit();
    },
  }));

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
      className="relative min-h-0 flex-1 cursor-grab select-none overflow-hidden bg-surface-canvas active:cursor-grabbing"
      style={{ backgroundImage: "radial-gradient(#dddbd6 1px, transparent 1px)", backgroundSize: "22px 22px" }}
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
                  <rect x={edge.labelX - ([...edge.label].length * 12 + 14) / 2} y={edge.labelY - 9} width={[...edge.label].length * 12 + 14} height="18" rx="9" fill="var(--app-card)" stroke={edge.color} />
                  <text x={edge.labelX} y={edge.labelY + 4} textAnchor="middle" fill={edge.color} fontSize="11">{edge.label}</text>
                </g>
              )}
            </g>
          ))}
        </svg>
        {vertices.map((vertex) => (
          <EventGraphVertex
            key={vertex.id}
            vertex={vertex}
            scaleRef={scaleRef}
            onSelect={onSelectVertex}
            onMove={onMoveVertex}
            onExtend={onExtendVertex}
          />
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
      <p className="pointer-events-none absolute bottom-3 right-3.5 m-0 hidden text-[11px] text-text-subtle min-[900px]:block">悬停节点，加号沿圆周滑动 · 点顶点聚焦相关点和边</p>
    </div>
  );
}
