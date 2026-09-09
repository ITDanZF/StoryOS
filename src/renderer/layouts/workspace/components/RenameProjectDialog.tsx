import { FolderPen, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { AnimatedDialog } from "../../../components/motion/index.ts";

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

  const submit = async (event: FormEvent<HTMLFormElement>, close: () => void) => {
    event.preventDefault();
    if (!normalizedName || unchanged || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onRename(normalizedName);
      close();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatedDialog onClose={onClose} busy={submitting} aria-labelledby="rename-project-title" className="max-w-[420px] rounded-2xl border border-border bg-card text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
      {({ close }) => <form className="p-5" onSubmit={(event) => void submit(event, close)}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-text-secondary"><FolderPen size={19} /></span>
          <span className="grid min-w-0 flex-1 gap-1">
            <strong className="text-sm" id="rename-project-title">重命名项目</strong>
            <span className="text-[11px] leading-5 text-muted-foreground">磁盘文件夹会同步重命名，项目内对话和资源保持不变。</span>
          </span>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-text-subtle hover:bg-muted hover:text-text-secondary" type="button" aria-label="关闭重命名项目弹窗" disabled={submitting} onClick={close}><X size={17} /></button>
        </div>
        <label className="mt-5 grid gap-2 text-xs text-text-secondary">
          <span>项目名称</span>
          <input
            className="h-10 rounded-xl border border-border-strong bg-card px-3 text-sm outline-none transition placeholder:text-text-subtle focus:border-ring focus:ring-2 focus:ring-border"
            value={name}
            autoFocus
            maxLength={120}
            aria-label="新的项目名称"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-[11px] leading-4 text-danger-text" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-border bg-card px-4 text-xs text-text-secondary hover:bg-surface-subtle" type="button" disabled={submitting} onClick={close}>取消</button>
          <button className="h-9 rounded-lg border-0 bg-primary px-4 text-xs text-primary-foreground hover:bg-primary disabled:bg-border-strong" type="submit" disabled={!normalizedName || unchanged || submitting}>{submitting ? "重命名中…" : "确认重命名"}</button>
        </div>
      </form>}
    </AnimatedDialog>
  );
}
