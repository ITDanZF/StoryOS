import { AnimatedDialog } from "../../../components/motion/index.ts";
import { AlertTriangle, Copy, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { BookshelfTrashEntry } from "../../../../shared/agent/contracts.ts";

export default function PermanentDeleteBookDialog({
  entry,
  busy,
  onClose,
  onConfirm,
}: {
  readonly entry: BookshelfTrashEntry;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [copyNotice, setCopyNotice] = useState(false);
  const confirmed = confirmation === entry.bookId;

  const copyBookId = async () => {
    await navigator.clipboard.writeText(entry.bookId);
    setCopyNotice(true);
  };

  return (
    <AnimatedDialog busy={busy} onClose={onClose} aria-labelledby="permanent-delete-title" className="max-w-[470px] rounded-2xl border border-border bg-card shadow-2xl">
      {({ close }) => <form className="p-5" onSubmit={(event) => {
        event.preventDefault();
        if (confirmed && !busy) void onConfirm().then(deleted => { if (deleted) close(); });
      }}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-surface text-danger-text"><AlertTriangle size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-sm font-semibold text-foreground" id="permanent-delete-title">永久删除《{entry.title}》</h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-danger-text">正文、章节版本和书籍资源将被永久删除，此操作无法撤销。</p>
          </div>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-text-subtle hover:bg-muted" type="button" aria-label="关闭" disabled={busy} onClick={close}><X size={16} /></button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface-subtle p-3">
          <span className="text-[10px] font-medium text-muted-foreground">完整书籍 ID</span>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-[10px] leading-5 text-text-secondary">{entry.bookId}</code>
            <button className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground" type="button" title="复制书籍 ID" onClick={() => void copyBookId()}><Copy size={14} /></button>
          </div>
          {copyNotice && <span className="mt-1 block text-[9px] text-success-text">已复制</span>}
        </div>

        <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-text-secondary">
          <span>输入完整书籍 ID 以确认</span>
          <input className="h-10 rounded-xl border border-border px-3 font-mono text-xs outline-none focus:border-danger-border focus:ring-4 focus:ring-danger-border" autoFocus value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-medium hover:bg-surface-subtle disabled:opacity-50" type="button" disabled={busy} onClick={close}>取消</button>
          <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-4 text-xs font-medium text-inverse hover:bg-destructive disabled:opacity-40" type="submit" disabled={!confirmed || busy}><Trash2 size={14} />{busy ? "正在永久删除…" : "永久删除"}</button>
        </div>
      </form>}
    </AnimatedDialog>
  );
}
