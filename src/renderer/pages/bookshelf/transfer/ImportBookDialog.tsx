import {
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  BookTransferFormatCapability,
  ImportBookResult,
} from "../../../../shared/agent/contracts.ts";
import FileBrowser from "../../../features/file-browser/FileBrowser.tsx";
import TransferFormatGrid from "./TransferFormatGrid.tsx";
import useBookImportFlow from "./useBookImportFlow.ts";

export default function ImportBookDialog({
  onClose,
  onImported,
}: {
  readonly onClose: () => void;
  readonly onImported: (result: ImportBookResult) => Promise<void> | void;
}) {
  const [formats, setFormats] = useState<readonly BookTransferFormatCapability[]>([]);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const flow = useBookImportFlow(onImported);
  const busy = flow.state.phase === "inspecting" || flow.state.phase === "importing";

  useEffect(() => {
    void window.storyOSAgent.getBookTransferFormats().then(setFormats).catch((cause) => {
      setFormatError(cause instanceof Error ? cause.message : String(cause));
    });
  }, []);

  const close = () => {
    if (busy) return;
    void flow.dispose().finally(onClose);
  };
  const format = "format" in flow.state ? flow.state.format : null;

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/30 p-3 backdrop-blur-[3px]" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) close();
    }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      if (flow.state.phase !== "browse") return;
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const filePath = window.storyOSWindow.getDroppedFilePath(file);
      if (filePath) void flow.inspect(filePath);
    }}>
      <section className="flex h-[min(760px,calc(100dvh-24px))] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-[#f7f7f5] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="import-book-title">
        <header className="flex shrink-0 items-start gap-3 border-b border-neutral-200 bg-white px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-900 text-white"><Upload size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="m-0 text-base font-semibold" id="import-book-title">导入书籍</h2><p className="mb-0 mt-1 text-[11px] leading-5 text-neutral-500">先了解格式能力并预览内容，确认后才会写入书架。</p></div>
          <div className="mr-2 hidden items-center gap-1 text-[8px] text-neutral-400 sm:flex"><span className="rounded-full bg-neutral-900 px-2 py-1 text-white">1 格式</span><span>—</span><span className={flow.state.phase !== "choose-format" ? "text-neutral-800" : ""}>2 文件</span><span>—</span><span className={["preview", "importing", "success"].includes(flow.state.phase) ? "text-neutral-800" : ""}>3 预览与导入</span></div>
          <button className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 disabled:opacity-40" type="button" disabled={busy} onClick={close} aria-label="关闭"><X size={16} /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
          {flow.state.phase === "choose-format" && <div className="min-h-0 overflow-y-auto"><div className="mb-5"><h3 className="m-0 text-xl font-semibold">选择导入来源</h3><p className="mb-0 mt-1.5 text-[11px] leading-5 text-neutral-500">完整备份会保留修订历史，外部稿件只导入当前正文。</p></div>{formatError ? <p className="rounded-xl bg-red-50 p-3 text-[10px] text-red-700">{formatError}</p> : <TransferFormatGrid formats={formats} direction="import" selected={null} onSelect={flow.selectFormat} />}</div>}

          {flow.state.phase === "browse" && format && <div className="flex min-h-0 flex-1 flex-col gap-3"><div className="flex items-center justify-between"><div><h3 className="m-0 text-sm font-semibold">选择 {format.label} 文件</h3><p className="mb-0 mt-1 text-[9px] text-neutral-500">支持拖放，或在 StoryOS 文件浏览器中选择。</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[9px] text-neutral-500 shadow-sm">{format.extensions.map((item) => `.${item}`).join(" / ")}</span></div><FileBrowser extensions={format.extensions} mode="file" selectedFile={selectedFile} onSelectFile={setSelectedFile} /><div className="flex justify-between"><button className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-[10px] font-semibold" type="button" onClick={() => void flow.back()}><ArrowLeft size={13} />返回格式</button><button className="h-9 rounded-xl bg-neutral-900 px-5 text-[10px] font-semibold text-white disabled:opacity-40" type="button" disabled={!selectedFile} onClick={() => selectedFile && void flow.inspect(selectedFile)}>分析文件</button></div></div>}

          {flow.state.phase === "inspecting" && <div className="grid flex-1 place-items-center text-center"><div><LoaderCircle className="mx-auto animate-spin text-neutral-700" size={28} /><strong className="mt-4 block text-sm">正在安全分析文件</strong><p className="mt-2 max-w-sm text-[10px] leading-5 text-neutral-500">正在复制临时副本、计算指纹、校验格式并识别卷章结构。</p></div></div>}

          {flow.state.phase === "preview" && <div className="flex min-h-0 flex-1 flex-col gap-3"><div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto]"><div><span className="text-[8px] font-semibold uppercase tracking-[.12em] text-neutral-400">导入预览</span><h3 className="mb-0 mt-1 text-lg font-semibold">{flow.state.preview.title}</h3><p className="mb-0 mt-1 line-clamp-2 text-[10px] leading-5 text-neutral-500">{flow.state.preview.synopsis || "没有简介"}</p></div><div className="grid grid-cols-3 gap-2 text-center"><span className="rounded-xl bg-neutral-50 px-3 py-2"><b className="block text-sm">{flow.state.preview.volumes.length}</b><small className="text-[8px] text-neutral-400">卷</small></span><span className="rounded-xl bg-neutral-50 px-3 py-2"><b className="block text-sm">{flow.state.preview.chapterCount}</b><small className="text-[8px] text-neutral-400">章</small></span><span className="rounded-xl bg-neutral-50 px-3 py-2"><b className="block text-sm">{flow.state.preview.characterCount.toLocaleString()}</b><small className="text-[8px] text-neutral-400">字</small></span></div></div><div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3">{flow.state.preview.ungroupedChapters.length > 0 && <div className="mb-3"><strong className="px-2 text-[10px]">未分卷章节</strong>{flow.state.preview.ungroupedChapters.map((chapter) => <div className="mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-[9px] hover:bg-neutral-50" key={chapter.key}><span>{chapter.title}</span><span className="text-neutral-400">{chapter.characterCount.toLocaleString()} 字</span></div>)}</div>}{flow.state.preview.volumes.map((volume) => <div className="mb-3" key={volume.key}><strong className="px-2 text-[10px]">{volume.title}</strong>{volume.chapters.map((chapter) => <div className="mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-[9px] hover:bg-neutral-50" key={chapter.key}><span>{chapter.title}</span><span className="text-neutral-400">{chapter.characterCount.toLocaleString()} 字</span></div>)}</div>)}</div>{flow.state.preview.warnings.map((warning) => <p className="m-0 rounded-xl bg-amber-50 px-3 py-2 text-[9px] text-amber-800" key={`${warning.code}-${warning.message}`}>{warning.message}</p>)}<div className="flex justify-between"><button className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-[10px] font-semibold" type="button" onClick={() => void flow.back()}><ArrowLeft size={13} />重新选择</button><button className="h-9 rounded-xl bg-neutral-900 px-5 text-[10px] font-semibold text-white" type="button" onClick={() => void flow.commit()}>确认导入为新书</button></div></div>}

          {flow.state.phase === "importing" && <div className="grid flex-1 place-items-center text-center"><div><LoaderCircle className="mx-auto animate-spin" size={28} /><strong className="mt-4 block text-sm">正在写入书架</strong><p className="mt-2 text-[10px] text-neutral-500">正在创建独立书库并执行完整性验证，请不要关闭应用。</p></div></div>}

          {flow.state.phase === "success" && <div className="grid flex-1 place-items-center text-center"><div><CheckCircle2 className="mx-auto text-emerald-600" size={34} /><strong className="mt-4 block text-base">《{flow.state.result.title}》已导入</strong><p className="mt-2 text-[10px] text-neutral-500">已作为一本新书加入书架，原文件没有被修改。</p><button className="mt-5 h-9 rounded-xl bg-neutral-900 px-5 text-[10px] font-semibold text-white" type="button" onClick={onClose}>完成</button></div></div>}

          {flow.state.phase === "error" && <div className="grid flex-1 place-items-center text-center"><div className="max-w-md"><FileSearch className="mx-auto text-red-500" size={30} /><strong className="mt-4 block text-sm">无法完成导入</strong><p className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-left text-[10px] leading-5 text-red-700">{flow.state.message}</p><div className="mt-4 flex justify-center gap-2"><button className="h-9 rounded-xl border border-neutral-200 bg-white px-4 text-[10px] font-semibold" type="button" onClick={() => void flow.back()}>重新选择</button><button className="h-9 rounded-xl bg-neutral-900 px-4 text-[10px] font-semibold text-white" type="button" onClick={close}>关闭</button></div></div></div>}
        </div>
      </section>
    </div>
  );
}
