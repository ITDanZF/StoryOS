import { FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { StoryInstanceDto } from "../../../shared/contracts/instances/contracts.ts";
import { IconButton } from "../../components/ui/Button.tsx";
import { cn } from "../../../lib/utils.ts";

type Props = {
  readonly instance: StoryInstanceDto;
  readonly active: boolean;
  readonly busy: boolean;
  readonly onOpen: () => void;
  readonly onEdit: () => void;
  readonly onReveal: () => void;
  readonly onRelocate: () => void;
  readonly onRemove: () => void;
};

function action(event: MouseEvent<HTMLButtonElement>, run: () => void): void {
  event.stopPropagation();
  run();
}

export default function InstanceCard({
  instance,
  active,
  busy,
  onOpen,
  onEdit,
  onReveal,
  onRelocate,
  onRemove,
}: Props) {
  const unavailable = instance.status === "missing" || instance.status === "invalid";
  const status = active
    ? "正在使用"
    : instance.status === "missing"
      ? "目录缺失"
      : instance.status === "invalid"
        ? "目录无效"
        : instance.status === "ready"
          ? "已配置"
          : "待初始化";

  return (
    <article
      className={cn(
        "group relative flex min-h-44 cursor-pointer flex-col justify-between rounded-lg border bg-card p-5 text-left",
        "transition-[transform,background-color,border-color,box-shadow] duration-150",
        "hover:-translate-y-0.5 hover:border-ring/70 hover:bg-surface-subtle hover:shadow-lg",
        "active:translate-y-0 active:scale-[0.99] active:shadow-sm",
        "focus-within:border-ring/70",
        active ? "border-primary/60 shadow-sm" : "border-border",
        unavailable && "cursor-default",
      )}
      onClick={() => { if (!busy && !unavailable) onOpen(); }}
      onKeyDown={(event) => {
        if (!busy && !unavailable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={unavailable ? -1 : 0}
      role="button"
      aria-label={`打开实例 ${instance.name}`}
      aria-disabled={busy || unavailable}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-muted text-text-secondary transition-colors group-hover:bg-background group-hover:text-foreground">
          <FolderOpen size={19} />
        </span>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>

      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-foreground">{instance.name}</h2>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={instance.rootPath}>{instance.rootPath}</p>
        <div className="mt-3 flex items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
          <IconButton disabled={busy} aria-label={`编辑 ${instance.name} 配置`} title="编辑实例配置" onClick={(event) => action(event, onEdit)}><Pencil size={15} /></IconButton>
          <IconButton disabled={busy} aria-label={`显示 ${instance.name} 的目录`} title="显示目录" onClick={(event) => action(event, onReveal)}><FolderOpen size={15} /></IconButton>
          {unavailable && <button type="button" disabled={busy} className="h-8 rounded-lg px-2 text-xs text-text-secondary hover:bg-muted hover:text-foreground" onClick={(event) => action(event, onRelocate)}>重新定位</button>}
          {!active && <IconButton disabled={busy} aria-label={`移除 ${instance.name}`} title="从列表移除" onClick={(event) => action(event, onRemove)}><Trash2 size={15} /></IconButton>}
        </div>
      </div>
    </article>
  );
}
