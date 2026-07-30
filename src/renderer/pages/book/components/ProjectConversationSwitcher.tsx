import {
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ThreadSnapshot } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";

type ProjectConversationSwitcherProps = {
  readonly snapshot: ThreadSnapshot | null;
  readonly connected: boolean;
  readonly runningThreadIds: ReadonlySet<string>;
  readonly onCreate: () => Promise<void>;
  readonly onSelect: (threadId: string) => Promise<void>;
  readonly onDelete: (threadId: string) => Promise<void>;
};

function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "";

  const today = new Date();
  if (updatedAt.toDateString() === today.toDateString()) {
    return updatedAt.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return updatedAt.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export default function ProjectConversationSwitcher({
  snapshot,
  connected,
  runningThreadIds,
  onCreate,
  onSelect,
  onDelete,
}: ProjectConversationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const activeTitle = snapshot
    ? snapshot.activeThread?.title ?? "开始新对话"
    : "正在载入项目对话…";

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        className={cn(
          "grid min-w-0 gap-0.5 rounded-lg border-0 bg-transparent px-2 py-1 text-left transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
          open && "bg-neutral-100",
        )}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-1">
          <strong className="truncate text-xs">{activeTitle}</strong>
          <ChevronDown
            className={cn(
              "shrink-0 text-neutral-400 transition-transform",
              open && "rotate-180",
            )}
            size={13}
          />
        </span>
        <small className="flex items-center gap-1.5 text-[10px] text-neutral-400">
          <i
            className={cn(
              "size-[5px] rounded-full",
              connected ? "bg-emerald-500" : "bg-neutral-400",
            )}
          />
          {connected ? "AI 助手在线" : "AI 尚未配置"}
        </small>
      </button>

      <section
        className={cn(
          "absolute left-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_18px_46px_rgba(30,28,20,0.16)] transition-all",
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-1 opacity-0",
        )}
        id={popoverId}
        role="dialog"
        aria-label="切换项目对话"
      >
        <header className="flex min-h-14 items-center justify-between border-b border-neutral-100 px-3">
          <span className="grid gap-0.5">
            <strong className="text-[11px] text-neutral-800">项目对话</strong>
            <small className="text-[9px] text-neutral-400">
              {snapshot ? `${snapshot.threads.length} 个对话` : "正在载入…"}
            </small>
          </span>
          <button
            className="inline-flex h-8 items-center gap-1 rounded-lg border-0 bg-violet-50 px-2.5 text-[10px] font-medium text-violet-700 transition hover:bg-violet-100"
            type="button"
            onClick={async () => {
              setOpen(false);
              await onCreate();
            }}
          >
            <Plus size={13} />
            新建
          </button>
        </header>

        <div
          className="max-h-72 overflow-y-auto p-1.5"
          role="list"
          aria-label="项目对话列表"
        >
          {!snapshot && (
            <div className="px-3 py-8 text-center text-[10px] text-neutral-400">
              正在载入项目对话…
            </div>
          )}
          {snapshot?.threads.length === 0 && (
            <div className="px-3 py-8 text-center">
              <strong className="block text-[11px] font-medium text-neutral-500">
                暂无项目对话
              </strong>
              <span className="mt-1 block text-[9px] text-neutral-400">
                新建对话或直接在下方输入消息
              </span>
            </div>
          )}
          {snapshot?.threads.map((thread) => {
            const active = thread.id === snapshot.activeThreadId;
            const running = runningThreadIds.has(thread.id);
            return (
              <div
                className={cn(
                  "group/thread grid min-h-11 grid-cols-[18px_minmax(0,1fr)_30px] items-center gap-1 rounded-lg px-1.5 transition",
                  active ? "bg-violet-50" : "hover:bg-neutral-100",
                )}
                role="listitem"
                key={thread.id}
              >
                {running ? (
                  <LoaderCircle
                    className="animate-spin text-violet-600"
                    size={12}
                  />
                ) : (
                  <Check
                    className={cn(
                      "text-violet-600",
                      active ? "opacity-100" : "opacity-0",
                    )}
                    size={12}
                  />
                )}
                <button
                  className="grid min-w-0 gap-0.5 rounded-md border-0 bg-transparent px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={async () => {
                    if (!active) await onSelect(thread.id);
                    setOpen(false);
                  }}
                >
                  <strong
                    className={cn(
                      "truncate text-[11px] font-medium",
                      active ? "text-violet-800" : "text-neutral-700",
                    )}
                  >
                    {thread.title}
                  </strong>
                  <small className="text-[9px] text-neutral-400">
                    {running ? "正在生成" : formatUpdatedAt(thread.updatedAt)}
                  </small>
                </button>
                <button
                  className={cn(
                    "grid size-7 place-items-center rounded-md border-0 bg-transparent text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/thread:opacity-100",
                    active && "opacity-60",
                  )}
                  type="button"
                  disabled={running}
                  title={running ? "请先停止生成" : "删除对话"}
                  aria-label={`删除对话：${thread.title}`}
                  onClick={async () => {
                    if (!window.confirm(`确定删除对话“${thread.title}”吗？`)) {
                      return;
                    }
                    await onDelete(thread.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
