import { BookPlus, X } from "lucide-react";
import { useState } from "react";
import type { CreateBookshelfBookRequest } from "../../../../shared/agent/contracts.ts";

type NewBookDialogProps = {
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onCreate: (input: CreateBookshelfBookRequest) => Promise<void>;
};

export default function NewBookDialog({
  busy,
  onClose,
  onCreate,
}: NewBookDialogProps) {
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setError(null);
    try {
      await onCreate({ title: title.trim(), synopsis: synopsis.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/20 p-4 backdrop-blur-[2px]"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="w-full max-w-[460px] rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-book-title"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-neutral-900 text-white"><BookPlus size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-sm font-semibold" id="new-book-title">新建书籍</h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-neutral-500">先创建独立书籍资产，随后可以为它建立写作项目。</p>
          </div>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100" type="button" aria-label="关闭" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>

        <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-neutral-600">
          <span>书籍名称</span>
          <input className="h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-black/5" autoFocus maxLength={200} placeholder="例如：未寄出的冬天" value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
        </label>

        <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-neutral-600">
          <span>故事简介 <small className="font-normal text-neutral-400">可选</small></span>
          <textarea className="min-h-28 resize-y rounded-xl border border-neutral-200 px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-black/5" maxLength={20_000} placeholder="写下这个故事最重要的一句话。" value={synopsis} onChange={(event) => setSynopsis(event.target.value)} disabled={busy} />
        </label>

        {error && <p className="mb-0 mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-neutral-200 bg-white px-4 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="h-9 rounded-lg border border-neutral-900 bg-neutral-900 px-4 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50" type="submit" disabled={busy || !title.trim()}>{busy ? "正在创建…" : "创建书籍"}</button>
        </div>
      </form>
    </div>
  );
}
