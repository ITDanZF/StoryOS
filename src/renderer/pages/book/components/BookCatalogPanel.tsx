import {
  BookOpen,
  ChevronRight,
  ListTree,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import { chapterStatusLabel } from "../bookWorkspaceModel.ts";

type BookCatalogPanelProps = {
  readonly bookTitle: string;
  readonly volumes: readonly VolumeDto[];
  readonly chapters: readonly BookWorkspaceChapterDto[];
  readonly activeChapterId: string | null;
  readonly onSelectChapter: (chapterId: string) => void;
  readonly onCreateVolume: () => Promise<void>;
  readonly onCreateChapter: (volumeId: string | null) => Promise<void>;
  readonly onClose: () => void;
};

export default function BookCatalogPanel({
  bookTitle,
  volumes,
  chapters,
  activeChapterId,
  onSelectChapter,
  onCreateVolume,
  onCreateChapter,
  onClose,
}: BookCatalogPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedVolumes, setExpandedVolumes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const groups = useMemo(() => {
    const result = volumes.map((volume) => ({
      id: volume.id,
      title: volume.title,
      summary: volume.summary,
      volumeId: volume.id as string | null,
      chapters: chapters.filter((chapter) => chapter.volumeId === volume.id),
    }));
    const ungrouped = chapters.filter((chapter) => chapter.volumeId === null);
    if (ungrouped.length > 0 || volumes.length === 0) {
      result.unshift({
        id: "unvolumed",
        title: "未分卷",
        summary: "",
        volumeId: null,
        chapters: ungrouped,
      });
    }
    return result;
  }, [chapters, volumes]);

  useEffect(() => {
    setExpandedVolumes((current) => {
      const next = new Set(current);
      groups.forEach((group) => next.add(group.id));
      return next;
    });
  }, [groups]);

  const chapterNumbers = useMemo(
    () => new Map(chapters.map((chapter, index) => [chapter.id, index + 1])),
    [chapters],
  );
  const totalCharacters = chapters.reduce(
    (total, chapter) => total + chapter.characterCount,
    0,
  );

  return (
    <aside className="flex h-full w-[min(272px,86vw)] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/95 lg:w-[248px] 2xl:w-[270px] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-2xl">
      <div className="flex h-20 shrink-0 items-center justify-between px-5 pb-3 pt-4">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">当前书籍</span>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-neutral-900">{bookTitle}</h1>
        </div>
        <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" type="button" title="新建卷" aria-label="新建卷" onClick={() => void onCreateVolume()}>
          <Plus size={16} />
        </button>
      </div>

      <label className="mx-3.5 flex h-9 shrink-0 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 shadow-sm shadow-neutral-100 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
        <Search className="text-neutral-400" size={15} />
        <input className="min-w-0 flex-1 border-0 bg-transparent text-xs text-neutral-700 outline-none placeholder:text-neutral-400" type="search" value={query} placeholder="搜索章节" aria-label="搜索章节" onChange={(event) => setQuery(event.target.value)} />
      </label>

      <div className="mx-3.5 flex h-11 shrink-0 items-end border-b border-neutral-200">
        <div className="flex h-9 items-center gap-2 border-b-2 border-neutral-900 px-2 text-xs font-semibold text-neutral-900">
          <ListTree size={14} /><span>目录</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-5 pt-3" aria-label="章节目录">
        <div className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-neutral-700">
          <BookOpen className="text-violet-600" size={15} />
          <span className="flex-1 text-xs font-semibold">书籍概览</span>
          <small className="text-[10px] tabular-nums text-neutral-400">{totalCharacters.toLocaleString("zh-CN")} 字</small>
        </div>

        {chapters.length === 0 && (
          <div className="mx-2 mt-5 rounded-xl border border-dashed border-neutral-200 px-3 py-5 text-center text-[11px] leading-5 text-neutral-400">
            暂无章节<br />点击下方按钮开始创作
          </div>
        )}

        {groups.map((group) => {
          const expanded = expandedVolumes.has(group.id);
          const visibleChapters = group.chapters.filter((chapter) =>
            !normalizedQuery ||
            chapter.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
          if (normalizedQuery && visibleChapters.length === 0) return null;
          return (
            <section className="mt-1.5" key={group.id}>
              <header className="flex items-center">
                <button className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-neutral-700 hover:bg-white/80" type="button" aria-expanded={expanded} onClick={() => setExpandedVolumes((current) => {
                  const next = new Set(current);
                  if (next.has(group.id)) next.delete(group.id);
                  else next.add(group.id);
                  return next;
                })}>
                  <ChevronRight className={cn("shrink-0 text-neutral-400 transition-transform", expanded && "rotate-90")} size={12} />
                  <span className="flex min-w-0 items-baseline gap-2">
                    <strong className="text-[11px]">{group.title}</strong>
                    {group.summary && <small className="truncate text-[10px] text-neutral-400">{group.summary}</small>}
                  </span>
                </button>
                <button className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" type="button" aria-label={`在${group.title}新建章节`} onClick={() => void onCreateChapter(group.volumeId)}>
                  <Plus size={13} />
                </button>
              </header>
              {expanded && visibleChapters.map((chapter) => {
                const active = chapter.id === activeChapterId;
                return (
                  <button className={cn("grid min-h-[52px] w-full grid-cols-[28px_minmax(0,1fr)_6px] items-center gap-2 rounded-[10px] border-0 bg-transparent px-2 py-1.5 text-left transition hover:bg-white", active && "bg-violet-50/80 shadow-sm ring-1 ring-violet-100 hover:bg-violet-50/80")} type="button" key={chapter.id} aria-current={active ? "page" : undefined} onClick={() => {
                    onSelectChapter(chapter.id);
                    if (window.innerWidth < 1024) onClose();
                  }}>
                    <span className={cn("grid size-6 place-items-center rounded-md bg-neutral-100 text-[9px] tabular-nums text-neutral-500", active && "bg-neutral-900 text-white")}>{String(chapterNumbers.get(chapter.id) ?? 0).padStart(2, "0")}</span>
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-xs font-semibold text-neutral-800">{chapter.title}</strong>
                      <small className="text-[10px] text-neutral-400">{chapterStatusLabel(chapter)}{chapter.currentRevisionId && ` · ${chapter.characterCount.toLocaleString("zh-CN")} 字`}</small>
                    </span>
                    <i className={cn("size-[5px] rounded-full", active && "bg-violet-500")} />
                  </button>
                );
              })}
            </section>
          );
        })}
      </nav>

      <button className="mx-3.5 mb-3.5 mt-2 flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-transparent text-[11px] font-medium text-neutral-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700" type="button" onClick={() => void onCreateChapter(null)}>
        <Plus size={14} />新建章节
      </button>
    </aside>
  );
}
