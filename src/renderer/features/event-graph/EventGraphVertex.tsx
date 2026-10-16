import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { cn } from "../../../lib/utils.ts";
import type { Emphasis, GraphVertex } from "./model/buildEventGraph.ts";

const NODE = 80;
const ORBIT = 52;
const HIT = 32;

type EventGraphVertexProps = {
  readonly vertex: GraphVertex & { readonly emphasis: Emphasis; readonly chosen: boolean };
  readonly scaleRef: RefObject<number>;
  readonly onSelect: (id: string, shiftKey: boolean) => void;
  readonly onMove: (id: string, point: { x: number; y: number }) => void;
  readonly onExtend: (id: string, angle: number) => void;
};

export default function EventGraphVertex({ vertex, scaleRef, onSelect, onMove, onExtend }: EventGraphVertexProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const angleRef = useRef(0);
  const targetRef = useRef(0);
  const [hover, setHover] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [dragging, setDragging] = useState(false);
  const visible = (hover || keyboard) && !dragging;

  const readAngle = (event: { clientX: number; clientY: number }) => {
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return targetRef.current;
    return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
  };

  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const place = () => {
      const delta = Math.atan2(Math.sin(targetRef.current - angleRef.current), Math.cos(targetRef.current - angleRef.current));
      angleRef.current += reduced || Math.abs(delta) < 0.01 ? delta : delta * 0.34;
      const button = addRef.current;
      if (!button) return;
      button.style.left = `${NODE / 2 + Math.cos(angleRef.current) * ORBIT - HIT / 2}px`;
      button.style.top = `${NODE / 2 + Math.sin(angleRef.current) * ORBIT - HIT / 2}px`;
    };
    const tick = () => {
      place();
      frame = requestAnimationFrame(tick);
    };
    place();
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const follow = (event: ReactPointerEvent) => {
    if ((event.target as Element).closest("[data-add]")) return;
    const angle = readAngle(event);
    targetRef.current = angle;
    if (!hover) {
      angleRef.current = angle;
      setHover(true);
    }
  };

  return (
    <div
      ref={rootRef}
      className="absolute"
      style={{ left: vertex.x, top: vertex.y, width: NODE, height: NODE, zIndex: visible ? 5 : vertex.emphasis === "ghost" ? 0 : 2 }}
      data-vertex={vertex.id}
      onPointerEnter={follow}
      onPointerMove={follow}
      onPointerLeave={() => setHover(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setKeyboard(false);
      }}
    >
      <button
        ref={nodeRef}
        type="button"
        title={vertex.changeAfter || vertex.name}
        className={cn(
          "absolute inset-0 grid cursor-grab place-items-center overflow-hidden rounded-full border bg-card px-1.5 text-center leading-tight active:cursor-grabbing",
          vertex.kind === "arc" ? "border-4 border-double" : "border-[1.5px]",
          vertex.emphasis === "ghost" ? "border-border text-text-secondary opacity-30" : "border-border-strong text-foreground opacity-100",
          (vertex.emphasis === "focus" || vertex.chosen) && "z-[2] border-accent-foreground text-accent-foreground opacity-100",
          vertex.proposal && "border-dashed bg-accent/40",
          vertex.pending && "border-warning-border",
          vertex.transition && "border-warning-border text-warning-text",
        )}
        aria-pressed={vertex.chosen}
        onFocus={() => {
          angleRef.current = 0;
          targetRef.current = 0;
          setKeyboard(true);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          setDragging(true);
          onSelect(vertex.id, event.shiftKey);
          if (event.shiftKey) return;
          const origin = { x: vertex.x, y: vertex.y, clientX: event.clientX, clientY: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          const target = event.currentTarget;
          const move = (next: PointerEvent) => {
            const scale = scaleRef.current || 1;
            onMove(vertex.id, {
              x: origin.x + (next.clientX - origin.clientX) / scale,
              y: origin.y + (next.clientY - origin.clientY) / scale,
            });
          };
          const up = () => {
            setDragging(false);
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", up);
          };
          target.addEventListener("pointermove", move);
          target.addEventListener("pointerup", up);
        }}
      >
        <span className="grid gap-0.5">
          <small className="text-[10px] text-text-subtle">{vertex.proposal ? "草稿" : vertex.transition ? "过渡" : vertex.kind === "arc" ? "弧" : vertex.id}</small>
          <b className="line-clamp-2 text-xs font-semibold">{vertex.name}</b>
        </span>
      </button>
      {visible && (
        <button
          ref={addRef}
          type="button"
          className="absolute grid size-8 place-items-center border-0 bg-transparent p-0 motion-reduce:transition-none"
          style={{
            left: NODE / 2 + Math.cos(angleRef.current) * ORBIT - HIT / 2,
            top: NODE / 2 + Math.sin(angleRef.current) * ORBIT - HIT / 2,
          }}
          data-add=""
          aria-label={`在${vertex.name}之后添加节点`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onExtend(vertex.id, angleRef.current);
          }}
        >
          <span className="grid size-[22px] place-items-center rounded-full border border-border-strong bg-card text-foreground shadow-sm">
            <Plus size={13} strokeWidth={2.4} />
          </span>
        </button>
      )}
    </div>
  );
}
