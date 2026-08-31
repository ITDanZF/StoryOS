import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Clock3,
  RefreshCw,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  BookshelfBookCard,
  ProjectArchiveSummary,
  RestoreProjectArchiveDesktopRequest,
} from "../../../../shared/agent/contracts.ts";
import { useWorkspaceOutlet } from "../../../layouts/workspace/context.ts";
import RestoreProjectArchiveDialog from "./RestoreProjectArchiveDialog.tsx";
import useBookProjectArchives from "./useBookProjectArchives.ts";

type ReadyBook = Extract<BookshelfBookCard, { availability: "ready" }>;

const STATE_LABELS: Record<ProjectArchiveSummary["state"], string> = {
  creating: "处理中",
  available: "可恢复",
  corrupted: "已损坏",
  restored: "已恢复",
};

function formatArchiveTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function BookArchivesDialog({
  book,
  onClose,
}: {
  readonly book: ReadyBook;
  readonly onClose: () => void;
}) {
  const navigate = useNavigate();
  const { state, switchProject } = useWorkspaceOutlet();
  const archives = useBookProjectArchives(book.bookId);
  const [restoreTarget, setRestoreTarget] = useState<ProjectArchiveSummary | null>(null);
  const busy = archives.restoringArchiveId !== null;

  const restore = async (request: RestoreProjectArchiveDesktopRequest) => {
    const result = await archives.restore(request);
    if (!result) return;
    await switchProject(result.projectPath);
    navigate(`/projects/${result.projectId}/book`);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/20 p-4 backdrop-blur-[2px]" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="flex max-h-[min(720px,calc(100dvh-40px))] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="book-archives-title">
        <header className="flex items-start gap-3 border-b border-neutral-100 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><ArchiveRestore size={19} /></span>
          <div className="min-w-0 flex-1"><h2 className="m-0 truncate text-sm font-semibold" id="book-archives-title">《{book.title}》的项目归档</h2><p className="mb-0 mt-1 text-[11px] leading-5 text-neutral-500">恢复被删除的写作项目、对话、项目文件和书籍关系。</p></div>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100" type="button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={16} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {archives.phase === "loading" && <div className="grid gap-3">{[0, 1].map((item) => <div className="h-32 animate-pulse rounded-xl bg-neutral-100" key={item} />)}</div>}

          {archives.phase === "error" && <div className="grid min-h-48 place-items-center text-center"><div><AlertTriangle className="mx-auto text-red-500" size={24} /><strong className="mt-3 block text-sm">归档加载失败</strong><p className="mt-2 text-[11px] text-red-600">{archives.loadError}</p><button className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 px-4 text-[10px] font-semibold hover:bg-neutral-50" type="button" onClick={() => void archives.load()}><RefreshCw size={13} />重新加载</button></div></div>}

          {archives.phase === "ready" && archives.archives.length === 0 && <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-6 text-center"><div><ArchiveRestore className="mx-auto text-neutral-300" size={26} /><strong className="mt-3 block text-sm text-neutral-700">没有相关项目归档</strong><p className="mt-2 text-[11px] text-neutral-500">删除与这本书关联的项目后，归档会显示在这里。</p></div></div>}

          {archives.phase === "ready" && archives.archives.length > 0 && <div className="grid gap-3">{archives.archives.map((archive) => {
            const restorable = archive.state === "available" && archive.availableBookStrategies.length > 0;
            return <article className="rounded-xl border border-neutral-200 p-4" key={archive.archiveId}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500">{archive.state === "restored" ? <CheckCircle2 size={16} /> : archive.state === "corrupted" ? <AlertTriangle size={16} /> : <Clock3 size={16} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-neutral-900">{archive.projectName ?? "无法读取项目名称"}</strong><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-500">{STATE_LABELS[archive.state]}</span></div>
                  <p className="mb-0 mt-1 truncate text-[10px] text-neutral-400" title={archive.originalProjectPath ?? undefined}>{archive.originalProjectPath ?? archive.sourceProjectId}</p>
                  <time className="mt-2 block text-[10px] text-neutral-400" dateTime={archive.createdAt}>归档于 {formatArchiveTime(archive.createdAt)}</time>
                  {archive.state === "restored" && archive.restoredAt && <time className="mt-1 block text-[10px] text-emerald-600" dateTime={archive.restoredAt}>已于 {formatArchiveTime(archive.restoredAt)} 恢复</time>}
                  {archive.state === "corrupted" && <p className="mb-0 mt-2 text-[10px] text-red-600">归档校验未通过，不能恢复。</p>}
                  {archive.state === "available" && !restorable && <p className="mb-0 mt-2 text-[10px] text-amber-600">当前没有可用的书籍恢复策略。</p>}
                </div>
                <button className="h-9 shrink-0 rounded-xl bg-neutral-900 px-3 text-[10px] font-semibold text-white hover:bg-black disabled:opacity-35" type="button" disabled={!restorable || busy} onClick={() => setRestoreTarget(archive)}>恢复项目</button>
              </div>
            </article>;
          })}</div>}
        </div>

        {archives.actionError && <div className="mx-5 mb-5 flex items-center gap-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] text-red-700" role="alert"><span className="flex-1">{archives.actionError}</span><button className="font-semibold" type="button" onClick={archives.clearActionError}>关闭</button></div>}
      </section>

      {restoreTarget && <RestoreProjectArchiveDialog archive={restoreTarget} defaultParentPath={state.projects?.creationDefaults.parentPath ?? ""} busy={archives.restoringArchiveId === restoreTarget.archiveId} actionError={archives.actionError} onClose={() => { archives.clearActionError(); setRestoreTarget(null); }} onRestore={restore} />}
    </div>
  );
}
