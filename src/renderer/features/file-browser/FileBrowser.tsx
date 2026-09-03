import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock3,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  MapPin,
  Monitor,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../../lib/utils.ts";
import useFileBrowser from "./useFileBrowser.ts";

const LOCATION_ICONS = {
  home: UserRound,
  desktop: Monitor,
  documents: FileText,
  downloads: Download,
  recent: Clock3,
  volume: HardDrive,
} as const;

function formatSize(value: number | null): string {
  if (value === null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileBrowser({
  extensions,
  mode,
  selectedFile,
  onSelectFile,
  onDirectoryChange,
}: {
  readonly extensions: readonly string[];
  readonly mode: "file" | "directory";
  readonly selectedFile?: string | null;
  readonly onSelectFile?: (filePath: string) => void;
  readonly onDirectoryChange?: (directoryPath: string) => void;
}) {
  const browser = useFileBrowser(extensions);
  const [selectedPath, setSelectedPath] = useState<string | null>(selectedFile ?? null);
  const breadcrumbs = useMemo(() => browser.directoryPath?.split(/[\\/]+/).filter(Boolean) ?? [], [browser.directoryPath]);

  useEffect(() => {
    if (browser.directoryPath) onDirectoryChange?.(browser.directoryPath);
  }, [browser.directoryPath, onDirectoryChange]);

  const openDirectory = (path: string) => {
    setSelectedPath(null);
    void browser.openDirectory(path).then(() => onDirectoryChange?.(path));
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[172px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
      <aside className="min-h-0 overflow-y-auto border-r border-neutral-200/70 bg-neutral-50 p-3">
        <div className="mb-3 flex items-center gap-2 px-1.5 text-neutral-500">
          <span className="grid size-7 place-items-center rounded-lg bg-white text-neutral-700 shadow-sm ring-1 ring-neutral-200/70"><MapPin size={13} /></span>
          <span className="text-[10px] font-semibold tracking-wide">常用位置</span>
        </div>
        <div className="grid gap-1">
          {browser.locations.map((location) => {
            const LocationIcon = LOCATION_ICONS[location.kind];
            const active = browser.directoryPath === location.absolutePath;
            return <button className={cn("group flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[11px] text-neutral-600 transition hover:bg-white hover:text-neutral-900", active && "bg-white font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200/70")} type="button" onClick={() => openDirectory(location.absolutePath)} key={location.id}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500 transition group-hover:bg-neutral-50", active && "bg-violet-50 text-violet-700")}><LocationIcon size={14} /></span>
              <span className="truncate">{location.label}</span>
            </button>;
          })}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-13 shrink-0 items-center gap-2 border-b border-neutral-100 px-3">
          <div className="flex shrink-0 items-center rounded-xl bg-neutral-50 p-1">
            <button className="grid size-7 place-items-center rounded-lg text-neutral-500 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm disabled:opacity-30" type="button" disabled={!browser.canGoBack} onClick={browser.goBack} aria-label="后退"><ArrowLeft size={14} /></button>
            <button className="grid size-7 place-items-center rounded-lg text-neutral-500 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm disabled:opacity-30" type="button" disabled={!browser.canGoForward} onClick={browser.goForward} aria-label="前进"><ArrowRight size={14} /></button>
            <button className="grid size-7 place-items-center rounded-lg text-neutral-500 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm disabled:opacity-30" type="button" disabled={!browser.parentPath} onClick={() => void browser.goUp()} aria-label="上一级"><ChevronRight className="-rotate-90" size={14} /></button>
          </div>
          <div className="flex h-8 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-xl bg-neutral-50 px-2.5 text-[10px] font-medium text-neutral-600 ring-1 ring-inset ring-neutral-100">
            <FolderOpen className="mr-0.5 shrink-0 text-amber-600" size={14} />
            {breadcrumbs.slice(-4).map((part, index) => <span className="flex min-w-0 items-center gap-1" key={`${part}-${index}`}>{index > 0 && <ChevronRight className="shrink-0 text-neutral-300" size={10} />}<span className="truncate">{part}</span></span>)}
          </div>
          <label className="flex h-8 w-44 shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 transition focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100"><Search size={13} className="text-neutral-400" /><input className="min-w-0 flex-1 border-0 bg-transparent text-[10px] text-neutral-700 outline-none placeholder:text-neutral-400" value={browser.query} onChange={(event) => browser.setQuery(event.target.value)} placeholder="搜索当前目录" /></label>
          <button className="grid size-8 shrink-0 place-items-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900" type="button" onClick={() => void browser.refresh()} aria-label="刷新"><RefreshCw size={13} /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid grid-cols-[minmax(0,1fr)_92px_116px] border-b border-neutral-100 bg-neutral-50/70 px-4 py-2.5 text-[9px] font-semibold text-neutral-400"><span>名称</span><span>大小</span><span>修改时间</span></div>
          <div className="min-h-0 overflow-y-auto p-2">
            {browser.loading && <div className="grid h-full place-items-center text-[10px] text-neutral-400">正在读取目录…</div>}
            {!browser.loading && browser.error && <div className="grid h-full place-items-center px-6 text-center text-[10px] text-red-600">{browser.error}</div>}
            {!browser.loading && !browser.error && browser.entries.length === 0 && <div className="grid h-full place-items-center text-[10px] text-neutral-400">当前目录没有可用内容</div>}
            {!browser.loading && !browser.error && browser.entries.map((entry) => {
              const selected = selectedPath === entry.absolutePath;
              return <button className={cn("grid h-10 w-full grid-cols-[minmax(0,1fr)_92px_116px] items-center rounded-xl px-2 text-left text-[10px] text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900", selected && "bg-violet-50 text-violet-900 ring-1 ring-inset ring-violet-100")} type="button" key={entry.absolutePath} onClick={() => {
                setSelectedPath(entry.absolutePath);
                if (entry.kind === "file") onSelectFile?.(entry.absolutePath);
              }} onDoubleClick={() => {
                if (entry.kind === "directory") openDirectory(entry.absolutePath);
                else onSelectFile?.(entry.absolutePath);
              }}>
                <span className="flex min-w-0 items-center gap-2.5">{entry.kind === "directory" ? <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><Folder className="fill-amber-100" size={15} /></span> : <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500"><File size={14} /></span>}<span className="truncate font-medium">{entry.name}</span></span>
                <span className="text-neutral-400">{formatSize(entry.size)}</span>
                <span className="text-neutral-400">{entry.modifiedAt ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.modifiedAt)) : ""}</span>
              </button>;
            })}
          </div>
        </div>
        {mode === "directory" && browser.directoryPath && <div className="flex h-10 shrink-0 items-center gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 text-[10px] text-neutral-500"><FolderOpen className="shrink-0 text-violet-600" size={13} /><span className="shrink-0">当前保存到</span><span className="truncate font-medium text-neutral-800">{browser.directoryPath}</span></div>}
      </div>
    </div>
  );
}
