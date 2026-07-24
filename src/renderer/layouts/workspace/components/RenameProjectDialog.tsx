import { FolderPen, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type RenameProjectDialogProps = {
  readonly projectName: string;
  readonly onClose: () => void;
  readonly onRename: (name: string) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function RenameProjectDialog({ projectName, onClose, onRename }: RenameProjectDialogProps) {
  const [name, setName] = useState(projectName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const normalizedName = name.trim();
  const unchanged = normalizedName === projectName;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, submitting]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedName || unchanged || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onRename(normalizedName);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/30 p-4 backdrop-blur-[1px]" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <form className="w-full max-w-[420px] rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-[0_24px_70px_rgba(0,0,0,0.22)]" onSubmit={(event) => void submit(event)}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700"><FolderPen size={19} /></span>
          <span className="grid min-w-0 flex-1 gap-1">
            <strong className="text-sm">重命名项目</strong>
            <span className="text-[11px] leading-5 text-neutral-500">磁盘文件夹会同步重命名，项目内对话和资源保持不变。</span>
          </span>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" type="button" aria-label="关闭重命名项目弹窗" disabled={submitting} onClick={onClose}><X size={17} /></button>
        </div>
        <label className="mt-5 grid gap-2 text-xs text-neutral-700">
          <span>项目名称</span>
          <input
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-600 focus:ring-2 focus:ring-neutral-200"
            value={name}
            autoFocus
            maxLength={120}
            aria-label="新的项目名称"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-[11px] leading-4 text-red-600" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-neutral-200 bg-white px-4 text-xs text-neutral-700 hover:bg-neutral-50" type="button" disabled={submitting} onClick={onClose}>取消</button>
          <button className="h-9 rounded-lg border-0 bg-neutral-900 px-4 text-xs text-white hover:bg-neutral-800 disabled:bg-neutral-300" type="submit" disabled={!normalizedName || unchanged || submitting}>{submitting ? "重命名中…" : "确认重命名"}</button>
        </div>
      </form>
    </div>
  );
}