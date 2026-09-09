import { AnimatedDialog } from "../../../components/motion/index.ts";
import { FolderOpen, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type {
  ProjectArchiveSummary,
  RestoreProjectArchiveDesktopRequest,
} from "../../../../shared/agent/contracts.ts";

export default function RestoreProjectArchiveDialog({
  archive,
  defaultParentPath,
  busy,
  actionError,
  onClose,
  onRestore,
}: {
  readonly archive: ProjectArchiveSummary;
  readonly defaultParentPath: string;
  readonly busy: boolean;
  readonly actionError: string | null;
  readonly onClose: () => void;
  readonly onRestore: (request: RestoreProjectArchiveDesktopRequest) => Promise<void>;
}) {
  const [projectName, setProjectName] = useState(
    archive.projectName ?? `恢复项目-${archive.sourceProjectId.slice(-6)}`,
  );
  const [parentPath, setParentPath] = useState(defaultParentPath);
  const [strategy, setStrategy] = useState<"snapshot" | "current">(
    archive.availableBookStrategies[0] ?? "snapshot",
  );
  const [selectingDirectory, setSelectingDirectory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseParentPath = async () => {
    setSelectingDirectory(true);
    setError(null);
    try {
      const selected = await window.storyOSWindow.pickDirectory({
        title: "选择恢复项目的父目录",
        defaultPath: parentPath,
      });
      if (selected) setParentPath(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSelectingDirectory(false);
    }
  };

  const blocked = busy || selectingDirectory;
  const canSubmit = Boolean(
    projectName.trim() &&
    parentPath.trim() &&
    archive.availableBookStrategies.includes(strategy),
  );

  return (
    <AnimatedDialog busy={blocked} onClose={onClose} aria-labelledby="restore-project-title" className="max-w-[500px] rounded-2xl border border-border bg-card shadow-2xl">
      {({ close }) => <form className="p-5" onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || blocked) return;
        void onRestore({
          archiveId: archive.archiveId,
          targetParentPath: parentPath.trim(),
          projectName: projectName.trim(),
          bookStrategy: strategy,
        });
      }}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><RotateCcw size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="m-0 text-sm font-semibold" id="restore-project-title">恢复写作项目</h2><p className="mb-0 mt-1 text-[11px] leading-5 text-muted-foreground">恢复项目文件、对话和删除时的书籍关系。</p></div>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-text-subtle hover:bg-muted" type="button" aria-label="关闭" disabled={blocked} onClick={close}><X size={16} /></button>
        </div>

        <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-text-secondary"><span>项目名称</span><input className="h-10 rounded-xl border border-border px-3 text-sm outline-none focus:border-border-strong focus:ring-4 focus:ring-black/5" maxLength={80} value={projectName} disabled={blocked} onChange={(event) => setProjectName(event.target.value)} /></label>

        <div className="mt-4 grid gap-1.5"><span className="text-[11px] font-medium text-text-secondary">项目父目录</span><button className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-surface-subtle px-3 text-left text-xs text-muted-foreground hover:bg-muted disabled:opacity-60" type="button" title={parentPath} disabled={blocked} onClick={() => void chooseParentPath()}><FolderOpen size={16} /><span className="min-w-0 flex-1 truncate">{selectingDirectory ? "正在选择目录…" : parentPath}</span></button></div>

        <fieldset className="mt-4 grid gap-2" disabled={blocked}>
          <legend className="mb-1 text-[11px] font-medium text-text-secondary">书籍内容来源</legend>
          {archive.availableBookStrategies.includes("snapshot") && <label className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent-border has-[:checked]:bg-accent/50"><input className="mt-0.5" type="radio" name="book-strategy" value="snapshot" checked={strategy === "snapshot"} onChange={() => setStrategy("snapshot")} /><span><strong className="block text-xs text-foreground">恢复删除时快照</strong><small className="mt-1 block text-[10px] leading-4 text-muted-foreground">创建一本新的书，保留当前书架内容不变。</small></span></label>}
          {archive.availableBookStrategies.includes("current") && <label className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent-border has-[:checked]:bg-accent/50"><input className="mt-0.5" type="radio" name="book-strategy" value="current" checked={strategy === "current"} onChange={() => setStrategy("current")} /><span><strong className="block text-xs text-foreground">关联当前书籍</strong><small className="mt-1 block text-[10px] leading-4 text-muted-foreground">使用书架中的最新正文，不复制书籍。</small></span></label>}
        </fieldset>

        {(error ?? actionError) && <p className="mb-0 mt-3 rounded-lg bg-danger-surface px-3 py-2 text-[11px] text-danger-text">{error ?? actionError}</p>}

        <div className="mt-5 flex justify-end gap-2"><button className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-medium hover:bg-surface-subtle disabled:opacity-50" type="button" disabled={blocked} onClick={close}>取消</button><button className="h-9 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40" type="submit" disabled={!canSubmit || blocked}>{busy ? "正在恢复…" : "恢复项目"}</button></div>
      </form>}
    </AnimatedDialog>
  );
}
