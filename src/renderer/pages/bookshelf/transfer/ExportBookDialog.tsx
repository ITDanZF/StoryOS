import { Check, Download, FolderOpen, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BookTransferFormatCapability, BookshelfBookCard } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import TransferFormatGrid, { TRANSFER_FORMAT_ICONS, TRANSFER_FORMAT_VISUALS } from "./TransferFormatGrid.tsx";
import useBookExportFlow from "./useBookExportFlow.ts";

type ReadyBook = Extract<BookshelfBookCard, { availability: "ready" }>;

function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/);
  return segments[segments.length - 1] || filePath;
}

function formatFileSize(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExportBookDialog({ book, onClose }: { readonly book: ReadyBook; readonly onClose: () => void }) {
  const [formats, setFormats] = useState<readonly BookTransferFormatCapability[]>([]);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectingDestination, setSelectingDestination] = useState(false);
  const promptedExportId = useRef<string | null>(null);
  const flow = useBookExportFlow(book);
  const busy = flow.state.phase === "preparing" || flow.state.phase === "destination" || flow.state.phase === "exporting" || selectingDestination;

  useEffect(() => { void window.storyOSAgent.getBookTransferFormats().then(setFormats).catch((cause) => setFormatError(cause instanceof Error ? cause.message : String(cause))); }, []);

  useEffect(() => {
    if (flow.state.phase !== "destination" || promptedExportId.current === flow.state.preview.exportId) return;
    const { format, preview } = flow.state;
    promptedExportId.current = preview.exportId;
    setSelectingDestination(true);
    void window.storyOSWindow.saveFile({
      title: `导出 ${format.label}`,
      defaultPath: preview.suggestedFileName,
      filters: [{ name: format.label, extensions: [preview.extension] }],
    }).then(async (outputPath) => {
      if (outputPath) await flow.commit(outputPath);
      else await flow.back();
    }).catch(async (cause) => {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
      await flow.back();
    }).finally(() => setSelectingDestination(false));
  }, [flow.state]);

  const close = () => { if (!busy) void flow.dispose().finally(onClose); };
  const successResult = flow.state.phase === "success" ? flow.state.result : null;
  const successFormat = successResult ? formats.find((format) => format.id === successResult.format) : null;
  const SuccessFormatIcon = successResult ? TRANSFER_FORMAT_ICONS[successResult.format] : Download;
  const successVisual = successResult ? TRANSFER_FORMAT_VISUALS[successResult.format] : null;

  return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/30 p-3 backdrop-blur-[3px]" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className={cn("flex w-full flex-col overflow-hidden border border-neutral-200 shadow-2xl", flow.state.phase === "choose-format" ? "h-[min(760px,calc(100dvh-24px))] max-w-[980px] rounded-2xl bg-[#f7f7f5]" : successResult ? "max-w-[540px] rounded-[24px] bg-white" : "min-h-[360px] max-w-[620px] rounded-2xl bg-[#f7f7f5]")} role="dialog" aria-modal="true" aria-labelledby="export-book-title">
      {!successResult && <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 bg-white px-5 py-4"><span className="grid size-10 place-items-center rounded-xl bg-neutral-900 text-white"><Download size={18} /></span><div className="min-w-0 flex-1"><h2 className="m-0 truncate text-base font-semibold" id="export-book-title">导出《{book.title}》</h2><p className="mb-0 mt-1 text-[11px] leading-5 text-neutral-500">选择用途和格式，StoryOS 会明确说明保留范围。</p></div><button className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 disabled:opacity-40" type="button" disabled={busy} onClick={close} aria-label="关闭"><X size={16} /></button></header>}
      <div className={cn("flex min-h-0 flex-1 flex-col", successResult ? "p-0" : "p-4 sm:p-5")}>
        {flow.state.phase === "choose-format" && <div className="min-h-0 overflow-y-auto"><div className="mb-5"><h3 className="m-0 text-xl font-semibold">选择导出格式</h3><p className="mb-0 mt-1.5 text-[11px] leading-5 text-neutral-500">只有 StoryOS 完整备份会包含全部修订历史。选择格式后将打开系统保存窗口。</p></div>{saveError && <p className="mb-3 rounded-xl bg-red-50 p-3 text-[10px] text-red-700">{saveError}</p>}{formatError ? <p className="rounded-xl bg-red-50 p-3 text-[10px] text-red-700">{formatError}</p> : <TransferFormatGrid formats={formats} direction="export" selected={null} onSelect={(format) => { setSaveError(null); void flow.selectFormat(format); }} />}</div>}
        {flow.state.phase === "preparing" && <div className="grid flex-1 place-items-center text-center"><div><LoaderCircle className="mx-auto animate-spin" size={28} /><strong className="mt-4 block text-sm">正在准备导出快照</strong><p className="mt-2 text-[10px] text-neutral-500">正在读取当前卷章和正文，不会修改书籍。</p></div></div>}
        {flow.state.phase === "destination" && <div className="grid flex-1 place-items-center text-center"><div><LoaderCircle className="mx-auto animate-spin" size={28} /><strong className="mt-4 block text-sm">正在打开系统保存窗口</strong></div></div>}
        {flow.state.phase === "exporting" && <div className="grid flex-1 place-items-center text-center"><div><LoaderCircle className="mx-auto animate-spin" size={28} /><strong className="mt-4 block text-sm">正在生成 {flow.state.format.label}</strong><p className="mt-2 text-[10px] text-neutral-500">正在转换、写入并验证输出文件。</p></div></div>}
        {successResult && successVisual && <div className="relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-100/70 blur-3xl" />
          <button className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700" type="button" onClick={onClose} aria-label="关闭"><X size={16} /></button>
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100"><Check size={12} strokeWidth={2.5} />导出成功</span>
            <h2 className="mb-0 mt-4 text-[22px] font-semibold tracking-[-0.02em] text-neutral-950" id="export-book-title">{successFormat?.label ?? "文稿"}已导出</h2>
            <p className="mb-0 mt-1.5 text-[11px] leading-5 text-neutral-500">文件已经安全保存到你选择的位置。</p>
          </div>

          <div className="relative mt-6 rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn("relative grid size-11 shrink-0 place-items-center rounded-xl ring-1", successVisual.icon)}>
                <SuccessFormatIcon aria-hidden="true" size={20} strokeWidth={1.8} />
                <span className={cn("absolute -bottom-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-md border px-1 text-[7px] font-extrabold leading-3 shadow-sm", successVisual.badge)}>{successVisual.shortLabel}</span>
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[13px] font-semibold text-neutral-900" title={getFileName(successResult.outputPath)}>{getFileName(successResult.outputPath)}</strong>
                <span className="mt-1 block text-[9px] font-medium text-neutral-400">{formatFileSize(successResult.byteLength)}</span>
              </div>
            </div>
            <div className="mt-4 flex min-w-0 items-center gap-2 border-t border-neutral-200/80 pt-3 text-neutral-400">
              <FolderOpen className="shrink-0" size={14} />
              <span className="min-w-0 flex-1 truncate text-[9px]" title={successResult.outputPath}>{successResult.outputPath}</span>
            </div>
          </div>

          <div className="relative mt-6 flex items-center justify-end gap-2">
            <button className="h-10 rounded-xl border border-neutral-200 bg-white px-4 text-[10px] font-semibold text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900" type="button" onClick={onClose}>完成</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-neutral-800" type="button" onClick={() => void window.storyOSWindow.revealFile(successResult.outputPath)}><FolderOpen size={14} />在文件夹中显示</button>
          </div>
        </div>}
        {flow.state.phase === "error" && <div className="grid flex-1 place-items-center text-center"><div className="max-w-md"><strong className="block text-sm">无法完成导出</strong><p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-left text-[10px] leading-5 text-red-700">{flow.state.message}</p><div className="mt-4 flex justify-center gap-2"><button className="h-9 rounded-xl border border-neutral-200 bg-white px-4 text-[10px] font-semibold" type="button" onClick={() => void flow.back()}>重新选择格式</button><button className="h-9 rounded-xl bg-neutral-900 px-4 text-[10px] font-semibold text-white" type="button" onClick={close}>关闭</button></div></div></div>}
      </div>
    </section>
  </div>;
}
