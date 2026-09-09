import { Toast } from "../../../components/ui/Notice.tsx";
import {
  ArrowLeft,
  BookOpen,
  Menu,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookshelfTrashEntry } from "../../../../shared/agent/contracts.ts";
import { useWorkspaceOutlet } from "../../../layouts/workspace/context.ts";
import PermanentDeleteBookDialog from "./PermanentDeleteBookDialog.tsx";
import useBookshelfTrash from "./useBookshelfTrash.ts";

function formatTrashTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function BookshelfTrashPage() {
  const navigate = useNavigate();
  const { openSidebar } = useWorkspaceOutlet();
  const trash = useBookshelfTrash();
  const [deleteTarget, setDeleteTarget] = useState<BookshelfTrashEntry | null>(null);
  const busy = trash.pendingAction !== null;

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-surface-canvas sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3" aria-label="书架回收站">
      <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-2 backdrop-blur-xl sm:px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <button className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-muted lg:hidden" type="button" aria-label="打开侧栏" onClick={openSidebar}><Menu size={19} /></button>
          <button className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-text-secondary hover:bg-surface-subtle" type="button" aria-label="返回我的书架" onClick={() => navigate("/bookshelf")}><ArrowLeft size={16} /></button>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Trash2 size={17} /></span>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-base font-semibold tracking-tight text-foreground">书架回收站</h1>
            <p className="mb-0 mt-0.5 text-[10px] text-text-subtle">{trash.entries.length} 本已回收书籍</p>
          </div>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[10px] font-semibold text-text-secondary hover:bg-surface-subtle disabled:opacity-50" type="button" disabled={trash.phase === "loading" || busy} onClick={() => void trash.load()}><RefreshCw size={13} />刷新</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-4xl">
          {trash.phase === "loading" && (
            <div className="grid gap-3" aria-label="正在加载回收站">
              {[0, 1, 2].map((item) => <div className="h-28 animate-pulse rounded-2xl border border-border bg-card" key={item} />)}
            </div>
          )}

          {trash.phase === "error" && (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-danger-border bg-card p-8 text-center">
              <div><strong className="text-sm text-foreground">回收站加载失败</strong><p className="mt-2 text-[11px] text-danger-text">{trash.loadError}</p><button className="mt-3 h-9 rounded-xl border border-border bg-card px-4 text-[10px] font-semibold hover:bg-surface-subtle" type="button" onClick={() => void trash.load()}>重新加载</button></div>
            </div>
          )}

          {trash.phase === "ready" && trash.entries.length === 0 && (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border-strong bg-card/70 p-8 text-center">
              <div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-text-subtle"><BookOpen size={21} /></span><strong className="mt-4 block text-sm text-foreground">回收站是空的</strong><p className="mt-2 text-[11px] text-muted-foreground">从书架回收的未关联书籍会出现在这里。</p><button className="mt-4 h-9 rounded-xl bg-primary px-4 text-[10px] font-semibold text-primary-foreground hover:bg-primary-hover" type="button" onClick={() => navigate("/bookshelf")}>返回我的书架</button></div>
            </div>
          )}

          {trash.phase === "ready" && trash.entries.length > 0 && (
            <div className="grid gap-3">
              {trash.entries.map((entry) => {
                const restoring = trash.pendingAction?.kind === "restore" && trash.pendingAction.bookId === entry.bookId;
                const deleting = trash.pendingAction?.kind === "delete" && trash.pendingAction.bookId === entry.bookId;
                return (
                  <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center" key={entry.bookId}>
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><BookOpen size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate font-serif text-base text-foreground">{entry.title}</strong>
                      <time className="mt-1 block text-[10px] text-text-subtle" dateTime={entry.trashedAt}>回收于 {formatTrashTime(entry.trashedAt)}</time>
                      <code className="mt-1 block truncate text-[9px] text-text-subtle" title={entry.bookId}>{entry.bookId}</code>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[10px] font-semibold text-text-secondary hover:bg-surface-subtle disabled:opacity-50" type="button" disabled={busy} onClick={() => void trash.restore(entry)}><RotateCcw size={13} />{restoring ? "正在恢复…" : "恢复"}</button>
                      <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-danger-border bg-danger-surface px-3 text-[10px] font-semibold text-danger-text hover:bg-danger-surface disabled:opacity-50" type="button" disabled={busy} onClick={() => setDeleteTarget(entry)}><Trash2 size={13} />{deleting ? "正在删除…" : "永久删除"}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {trash.actionError && <Toast tone="danger" onDismiss={trash.clearActionError}>{trash.actionError}</Toast>}
      {trash.notice && <Toast tone="success" onDismiss={trash.clearNotice}>{trash.notice}</Toast>}

      {deleteTarget && <PermanentDeleteBookDialog entry={deleteTarget} busy={trash.pendingAction?.kind === "delete"} onClose={() => setDeleteTarget(null)} onConfirm={async () => {
        return trash.permanentlyDelete(deleteTarget);
      }} />}
    </section>
  );
}
