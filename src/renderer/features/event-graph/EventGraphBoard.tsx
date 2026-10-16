import { Plus } from "lucide-react";
import { cn } from "../../../lib/utils.ts";
import type { GraphNode } from "./model/document.ts";

export default function EventGraphBoard({
  nodes,
  selectedId,
  busy,
  onSelect,
  onCreate,
}: {
  readonly nodes: readonly GraphNode[];
  readonly selectedId: string | null;
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
}) {
  const empty = nodes.length === 0;
  return (
    <div className="relative min-h-0 flex-1 bg-surface-canvas" aria-label="节点图">
      <div className={cn("flex h-full items-center gap-4 overflow-auto px-8 py-8", empty ? "justify-center" : "justify-start")}>
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            aria-pressed={node.id === selectedId}
            className={cn(
              "grid h-28 w-40 shrink-0 place-items-center rounded-2xl border bg-card px-3 text-center shadow-sm",
              node.id === selectedId ? "border-accent-foreground" : "border-border hover:border-border-strong",
            )}
            onClick={() => onSelect(node.id)}
          >
            <span className="line-clamp-2 text-sm font-semibold">{node.title}</span>
            <span className="mt-1 line-clamp-2 text-[11px] text-text-subtle">{node.changeAfter.trim() || "空白节点"}</span>
          </button>
        ))}
        <button
          type="button"
          className={cn(
            "grid shrink-0 place-items-center rounded-2xl border border-dashed border-border-strong bg-card text-text-secondary hover:border-accent-foreground hover:text-foreground",
            empty ? "h-40 w-40" : "h-28 w-28",
          )}
          disabled={busy}
          onClick={onCreate}
        >
          <Plus size={empty ? 28 : 20} />
          <span className="mt-2 text-sm font-semibold">新建空白</span>
        </button>
      </div>
    </div>
  );
}
