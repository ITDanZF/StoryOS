import { Plus } from "lucide-react";
import { cn } from "../../../lib/utils.ts";
import type { GraphNode } from "./model/document.ts";

export default function EventGraphStageBar({
  stages,
  activeId,
  busy,
  onSelect,
  onAdd,
}: {
  readonly stages: readonly GraphNode[];
  readonly activeId: string | null;
  readonly busy: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onAdd: () => void;
}) {
  return (
    <section className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-2" aria-label="阶段">
      <span className="shrink-0 text-[11px] font-semibold text-text-subtle">阶段</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-auto">
        <button
          type="button"
          className={cn("h-7 shrink-0 rounded-full border px-3 text-xs", activeId === null ? "border-accent-foreground bg-accent text-accent-foreground" : "border-border bg-background")}
          onClick={() => onSelect(null)}
        >全部</button>
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            aria-pressed={stage.id === activeId}
            className={cn("h-7 max-w-40 shrink-0 truncate rounded-full border px-3 text-xs", stage.id === activeId ? "border-accent-foreground bg-accent text-accent-foreground" : "border-border bg-background")}
            onClick={() => onSelect(stage.id)}
          >{stage.title}</button>
        ))}
      </div>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed border-border-strong bg-background px-2.5 text-xs"
        disabled={busy}
        onClick={onAdd}
      >
        <Plus size={12} />
        阶段
      </button>
    </section>
  );
}
