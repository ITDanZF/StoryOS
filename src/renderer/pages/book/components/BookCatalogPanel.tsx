import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderPlus,
  LayoutGrid,
  ListTree,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import type {
  BookPageSlice,
  LiveChapterPagination,
} from "../pagination/paginationModel.ts";
import BookPageGrid from "./BookPageGrid.tsx";
import DeleteBookItemDialog, {
  type DeleteBookItemTarget,
} from "./DeleteBookItemDialog.tsx";

type CatalogDeleteTarget = Extract<
  DeleteBookItemTarget,
  { readonly kind: "volume" | "chapter" }
>;

const CATALOG_WIDTH_STORAGE_KEY = "storyos:book-catalog-width";
const MIN_CATALOG_WIDTH = 216;
const MAX_CATALOG_WIDTH = 360;
const DEFAULT_CATALOG_WIDTH = 248;

function clampCatalogWidth(width: number): number {
  return Math.max(MIN_CATALOG_WIDTH, Math.min(MAX_CATALOG_WIDTH, width));
}

function getInitialCatalogWidth(): number {
  if (typeof window === "undefined") return DEFAULT_CATALOG_WIDTH;
  const stored = Number.parseFloat(
    window.localStorage.getItem(CATALOG_WIDTH_STORAGE_KEY) ?? "",
  );
  return Number.isFinite(stored)
    ? clampCatalogWidth(stored)
    : DEFAULT_CATALOG_WIDTH;
}

type BookCatalogPanelProps = {
  readonly bookTitle: string | null;
  readonly volumes: readonly VolumeDto[];
  readonly chapters: readonly BookWorkspaceChapterDto[];
  readonly activeChapterId: string | null;
  readonly activeChapterPageNumber: number | null;
  readonly livePagination: LiveChapterPagination | null;
  readonly onSelectChapter: (chapterId: string) => void;
  readonly onSelectPage: (page: BookPageSlice) => void;
  readonly onCreatePage: (
    chapterId: string,
    chapterPageNumber: number,
  ) => void;
  readonly onMovePage: (source: BookPageSlice, target: BookPageSlice) => void;
  readonly onDeletePage: (page: BookPageSlice) => void;
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
  activeChapterPageNumber,
  livePagination,
  onSelectChapter,
  onSelectPage,
  onCreatePage,
  onMovePage,
  onDeletePage,
  onCreateVolume,
  onCreateChapter,
  onShowOverview,
  onDeleteVolume,
  onDeleteChapter,
  onClose,
}: BookCatalogPanelProps) {
  const [view, setView] = useState<"chapters" | "pages">("chapters");
  const [query, setQuery] = useState("");
  const [expandedVolumes, setExpandedVolumes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [deleteTarget, setDeleteTarget] =
    useState<CatalogDeleteTarget | null>(null);
  const [catalogWidth, setCatalogWidth] = useState(getInitialCatalogWidth);
  const [catalogResizing, setCatalogResizing] = useState(false);
  const resizeStart = useRef<{
    readonly pointerId: number;
    readonly x: number;
    readonly width: number;
  } | null>(null);
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

  const updateCatalogWidth = (width: number) => {
    const nextWidth = clampCatalogWidth(width);
    setCatalogWidth(nextWidth);
    return nextWidth;
  };

  const startCatalogResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 1024) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      width: catalogWidth,
    };
    setCatalogResizing(true);
  };

  const moveCatalogResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    updateCatalogWidth(start.width + event.clientX - start.x);
  };

  const finishCatalogResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const nextWidth = updateCatalogWidth(
      start.width + event.clientX - start.x,
    );
    window.localStorage.setItem(
      CATALOG_WIDTH_STORAGE_KEY,
      String(nextWidth),
    );
    resizeStart.current = null;
    setCatalogResizing(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      <aside
        className="relative flex h-full w-[min(272px,86vw)] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/95 lg:w-[var(--book-catalog-width)] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-2xl"
        style={{
          "--book-catalog-width": `${catalogWidth}px`,
        } as CSSProperties}
      >
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
          <div className="flex h-full items-stretch" role="tablist" aria-label="书籍导航视图">
            <button
              className={cn(
                "flex h-full items-center gap-1.5 border-0 border-b-2 bg-transparent px-2 text-xs font-medium transition",
                view === "chapters"
                  ? "border-neutral-900 font-semibold text-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-700",
              )}
              type="button"
              role="tab"
              aria-selected={view === "chapters"}
              onClick={() => setView("chapters")}
            >
              <ListTree size={13} />
              目录
            </button>
            <button
              className={cn(
                "flex h-full items-center gap-1.5 border-0 border-b-2 bg-transparent px-2 text-xs font-medium transition",
                view === "pages"
                  ? "border-violet-600 font-semibold text-violet-700"
                  : "border-transparent text-neutral-400 hover:text-neutral-700",
              )}
              type="button"
              role="tab"
              aria-selected={view === "pages"}
              onClick={() => setView("pages")}
            >
              <LayoutGrid size={13} />
              页面
            </button>
          </div>
          {view === "chapters" && (
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
          )}
        </header>

        {view === "chapters" && chapters.length > 0 && (
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

        {view === "chapters" ? (
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
                              "flex min-h-12 w-full items-center gap-2 rounded-xl border-0 bg-transparent px-2.5 py-2 pr-9 text-left text-neutral-600 transition hover:bg-white hover:text-neutral-900",
                              active && "bg-white text-neutral-950 shadow-sm shadow-violet-100 ring-1 ring-violet-200 hover:bg-white",
                            )}
                            type="button"
                            title={chapter.title}
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
                            <strong
                              className="min-w-0 overflow-hidden text-[12px] font-medium leading-[17px]"
                              style={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: active ? 3 : 2,
                              }}
                            >
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
        ) : (
          <BookPageGrid
            volumes={volumes}
            chapters={chapters}
            activeChapterId={activeChapterId}
            activeChapterPageNumber={activeChapterPageNumber}
            livePagination={livePagination}
            onSelectPage={onSelectPage}
            onCreatePage={onCreatePage}
            onMovePage={onMovePage}
            onDeletePage={onDeletePage}
            onClose={onClose}
          />
        )}

        <div
          className={cn(
            "group/catalog-resize absolute inset-y-0 right-0 z-40 hidden w-1.5 translate-x-1/2 cursor-col-resize touch-none lg:block",
            catalogResizing && "bg-violet-50/70",
          )}
          role="separator"
          tabIndex={0}
          aria-label="调整目录宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_CATALOG_WIDTH}
          aria-valuemax={MAX_CATALOG_WIDTH}
          aria-valuenow={Math.round(catalogWidth)}
          onPointerDown={startCatalogResize}
          onPointerMove={moveCatalogResize}
          onPointerUp={finishCatalogResize}
          onPointerCancel={finishCatalogResize}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const nextWidth = updateCatalogWidth(
              catalogWidth + (event.key === "ArrowRight" ? 16 : -16),
            );
            window.localStorage.setItem(
              CATALOG_WIDTH_STORAGE_KEY,
              String(nextWidth),
            );
          }}
        >
          <span className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/catalog-resize:bg-violet-300 group-focus/catalog-resize:bg-violet-400",
            catalogResizing && "w-0.5 bg-violet-500",
          )} />
        </div>
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
