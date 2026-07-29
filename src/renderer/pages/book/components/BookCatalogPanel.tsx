import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderPlus,
  ListTree,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import DeleteBookItemDialog, {
  type DeleteBookItemTarget,
} from "./DeleteBookItemDialog.tsx";

type BookCatalogPanelProps = {
  readonly bookTitle: string | null;
  readonly volumes: readonly VolumeDto[];
  readonly chapters: readonly BookWorkspaceChapterDto[];
  readonly activeChapterId: string | null;
  readonly onSelectChapter: (chapterId: string) => void;
  readonly onCreateVolume: (() => Promise<void>) | null;
  readonly onCreateChapter: (volumeId: string) => Promise<void>;
  readonly onShowOverview: () => void;
  readonly onDeleteVolume: (volumeId: string) => Promise<void>;
  readonly onDeleteChapter: (chapterId: string) => Promise<void>;
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
  onShowOverview,
  onDeleteVolume,
  onDeleteChapter,
  onClose,
}: BookCatalogPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedVolumes, setExpandedVolumes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [deleteTarget, setDeleteTarget] =
    useState<DeleteBookItemTarget | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const groups = useMemo(
    () => volumes.map((volume) => ({
      ...volume,
      chapters: chapters.filter((chapter) => chapter.volumeId === volume.id),
    })),
    [chapters, volumes],
  );

  useEffect(() => {
    setExpandedVolumes((current) => {
      const next = new Set(current);
      groups.forEach((group) => next.add(group.id));
      return next;
    });
  }, [groups]);

  return (
    <>
      <aside className="flex h-full w-[min(272px,86vw)] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/95 lg:w-[248px] 2xl:w-[270px] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-2xl">
        <div className="shrink-0 px-5 pb-3 pt-5">
          <strong
            className="block truncate text-base font-semibold tracking-tight text-neutral-900"
            title={bookTitle ?? "待命名"}
          >
            {bookTitle ?? "待命名"}
          </strong>
        </div>

        <button
          className={cn(
            "mx-3 mb-1 flex h-10 shrink-0 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-xs font-medium text-neutral-600 transition hover:bg-white hover:text-violet-700",
            activeChapterId === null && "bg-violet-50 text-violet-700",
          )}
          type="button"
          aria-current={activeChapterId === null ? "page" : undefined}
          onClick={() => {
            onShowOverview();
            if (window.innerWidth < 1024) onClose();
          }}
        >
          <BookOpen size={15} />
          <span>书籍概览</span>
        </button>

        <header className="mx-3.5 flex h-14 shrink-0 items-center justify-between border-b border-neutral-200">
          <span className="flex h-full items-center gap-2 border-b-2 border-neutral-900 px-2 text-xs font-semibold text-neutral-900">
            <ListTree size={14} />
            目录
          </span>
          <button
            className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
            type="button"
            title={onCreateVolume ? "新建分卷" : "请先填写书籍名称"}
            aria-label={onCreateVolume ? "新建分卷" : "请先填写书籍名称后新建分卷"}
            disabled={!onCreateVolume}
            onClick={() => {
              if (onCreateVolume) void onCreateVolume();
            }}
          >
            <FolderPlus size={15} />
          </button>
        </header>

        {chapters.length > 0 && (
          <label className="mx-3.5 mt-3 flex h-9 shrink-0 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 shadow-sm shadow-neutral-100 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
            <Search className="text-neutral-400" size={14} />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-xs text-neutral-700 outline-none placeholder:text-neutral-400"
              type="search"
              value={query}
              placeholder="搜索章节标题"
              aria-label="搜索章节标题"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}

        <nav
          className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-5 pt-3"
          aria-label="章节目录"
        >
          {groups.length === 0 && (
            <div className="px-3 py-8 text-center">
              <strong className="block text-[11px] font-medium text-neutral-400">
                暂无分卷
              </strong>
            </div>
          )}

          {groups.map((group) => {
            const expanded = expandedVolumes.has(group.id);
            const visibleChapters = group.chapters.filter((chapter) =>
              !normalizedQuery ||
              chapter.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
            if (normalizedQuery && visibleChapters.length === 0) return null;
            return (
              <section className="mb-3" key={group.id}>
                <header className="group/volume flex min-w-0 items-center">
                  <button
                    className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-neutral-700 transition hover:bg-white/80 hover:text-neutral-950"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpandedVolumes((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })}
                  >
                    <ChevronRight
                      className={cn(
                        "shrink-0 text-neutral-400 transition-transform",
                        expanded && "rotate-90",
                      )}
                      size={12}
                    />
                    <span className="grid size-5 shrink-0 place-items-center rounded-md bg-neutral-900 text-[9px] font-semibold text-white">
                      卷
                    </span>
                    <strong className="truncate text-[12px] font-semibold">
                      {group.title}
                    </strong>
                  </button>
                  <span className="shrink-0 px-1 text-[10px] tabular-nums text-neutral-400">
                    {group.chapters.length} 章
                  </span>
                  <button
                    className="grid size-7 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-violet-700"
                    type="button"
                    title={`在“${group.title}”下新建章节`}
                    aria-label={`在“${group.title}”下新建章节`}
                    onClick={() => void onCreateChapter(group.id)}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    className="grid size-7 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/volume:opacity-100"
                    type="button"
                    title={`删除分卷“${group.title}”`}
                    aria-label={`删除分卷“${group.title}”`}
                    onClick={() => setDeleteTarget({
                      kind: "volume",
                      id: group.id,
                      title: group.title,
                      chapterCount: group.chapters.length,
                    })}
                  >
                    <Trash2 size={13} />
                  </button>
                </header>

                {expanded && visibleChapters.length === 0 && !normalizedQuery && (
                  <div className="ml-8 border-l border-dashed border-neutral-200 py-2 pl-4 text-[10px] text-neutral-400">
                    暂无章节
                  </div>
                )}

                {expanded && visibleChapters.length > 0 && (
                  <div className="ml-8 mt-1 space-y-1.5 border-l border-neutral-200 pl-3">
                    {visibleChapters.map((chapter) => {
                      const active = chapter.id === activeChapterId;
                      return (
                        <div
                          className="group/chapter relative rounded-xl"
                          key={chapter.id}
                        >
                          <button
                            className={cn(
                              "flex h-10 w-full items-center gap-2 rounded-xl border-0 bg-transparent px-2.5 pr-9 text-left text-neutral-600 transition hover:bg-white hover:text-neutral-900",
                              active && "bg-white text-neutral-950 shadow-sm shadow-violet-100 ring-1 ring-violet-200 hover:bg-white",
                            )}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            onClick={() => {
                              onSelectChapter(chapter.id);
                              if (window.innerWidth < 1024) onClose();
                            }}
                          >
                            <span className={cn(
                              "grid size-6 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-400 transition",
                              active && "bg-violet-600 text-white",
                            )}>
                              <FileText size={13} />
                            </span>
                            <strong className="truncate text-[12px] font-medium">
                              {chapter.title}
                            </strong>
                          </button>
                          <button
                            className={cn(
                              "absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg border-0 bg-transparent text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/chapter:opacity-100",
                              active && "opacity-60",
                            )}
                            type="button"
                            title={`删除章节“${chapter.title}”`}
                            aria-label={`删除章节“${chapter.title}”`}
                            onClick={() => setDeleteTarget({
                              kind: "chapter",
                              id: chapter.id,
                              title: chapter.title,
                            })}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {normalizedQuery && groups.every((group) =>
            group.chapters.every((chapter) =>
              !chapter.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery))) && (
            <div className="px-3 py-8 text-center text-[10px] text-neutral-400">
              没有匹配的章节
            </div>
          )}
        </nav>
      </aside>

      {deleteTarget && (
        <DeleteBookItemDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget.kind === "volume"
            ? onDeleteVolume(deleteTarget.id)
            : onDeleteChapter(deleteTarget.id)}
        />
      )}
    </>
  );
}
