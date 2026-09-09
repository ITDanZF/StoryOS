import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";

export function clampPanelWidth(
  width: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(Math.max(min, max), width));
}
export default function useResizablePanel({
  initial,
  min,
  max,
  direction,
  storageKey,
}: {
  initial: number;
  min: number;
  max: number;
  direction: 1 | -1;
  storageKey?: string;
}) {
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try {
      const stored = storageKey
        ? Number.parseFloat(localStorage.getItem(storageKey) ?? "")
        : NaN;
      return Number.isFinite(stored)
        ? clampPanelWidth(stored, min, max)
        : initial;
    } catch {
      return initial;
    }
  });
  const width = clampPanelWidth(preferredWidth, min, max);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    width: number;
    handle: HTMLDivElement;
  } | null>(null);
  const commit = (next: number) => {
    const value = clampPanelWidth(next, min, max);
    setPreferredWidth(value);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(value));
      } catch {
        /* Layout remains usable without persistence. */
      }
    }
  };
  useEffect(
    () => () => {
      if (drag.current?.handle.hasPointerCapture(drag.current.id))
        drag.current.handle.releasePointerCapture(drag.current.id);
      drag.current = null;
    },
    [],
  );
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    commit(current.width + (event.clientX - current.x) * direction);
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    width,
    resizing,
    handleProps: {
      role: "separator",
      tabIndex: 0,
      "aria-orientation": "vertical" as const,
      "aria-valuemin": min,
      "aria-valuemax": Math.max(min, max),
      "aria-valuenow": Math.round(width),
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          width,
          handle: event.currentTarget,
        };
        setResizing(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id === event.pointerId)
          setPreferredWidth(
            clampPanelWidth(
              drag.current.width + (event.clientX - drag.current.x) * direction,
              min,
              max,
            ),
          );
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: () => {
        drag.current = null;
        setResizing(false);
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        commit(
          event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : width + (event.key === "ArrowRight" ? 16 : -16) * direction,
        );
      },
    },
  };
}
