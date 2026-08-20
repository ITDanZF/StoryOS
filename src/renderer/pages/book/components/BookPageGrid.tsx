import {
  FileText,
  LoaderCircle,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../../../lib/utils.ts";
import {
  flattenBookChapterGroups,
  type BookChapterGroup,
} from "../bookWorkspaceModel.ts";
import useBookPagination from "../pagination/useBookPagination.ts";
import type {
  BookPageSlice,
  LiveChapterPagination,
} from "../pagination/paginationModel.ts";
import DeleteBookItemDialog from "./DeleteBookItemDialog.tsx";

type BookPageGridProps = {
  readonly groups: readonly BookChapterGroup[];
  readonly activeChapterId: string | null;
  readonly activeChapterPageNumber: number | null;
  readonly livePagination: LiveChapterPagination | null;
  readonly onSelectPage: (page: BookPageSlice) => void;
  readonly onCreatePage: (
    chapterId: string,
    chapterPageNumber: number,
  ) => void;
  readonly onMovePage: (source: BookPageSlice, target: BookPageSlice) => void;
  readonly onDeletePage: (page: BookPageSlice) => void;
  readonly onClose: () => void;
};

export default function BookPageGrid({
  groups,
  activeChapterId,
  activeChapterPageNumber,
  livePagination,
  onSelectPage,
  onCreatePage,
  onMovePage,
  onDeletePage,
  onClose,
}: BookPageGridProps) {
  const [draggedPage, setDraggedPage] = useState<BookPageSlice | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [deletePage, setDeletePage] = useState<{
    readonly page: BookPageSlice;
    readonly chapterTitle: string;
  } | null>(null);
  const orderedChapters = useMemo(
    () => flattenBookChapterGroups(groups),
    [groups],
  );
  const pagination = useBookPagination(orderedChapters, livePagination);
  const pagesByChapter = useMemo(() => {
    const result = new Map<string, BookPageSlice[]>();
    for (const page of pagination.pages) {
      const pages = result.get(page.chapterId) ?? [];
      pages.push(page);
      result.set(page.chapterId, pages);
    }
    return result;
  }, [pagination.pages]);
  if (orderedChapters.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-[11px] text-neutral-400">
        新建章节并开始写作后，页面会显示在这里。
      </div>
    );
  }

  return (
    <div className="book-page-grid-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3" aria-label="书籍页面">
      {groups.flatMap((group) => group.chapters.map((chapter, chapterIndex) => {
        const pages = pagesByChapter.get(chapter.id) ?? [];
        const measured = pagination.measuredChapterIds.has(chapter.id);
        const failed = pagination.failedChapterIds.has(chapter.id);
        return (
          <section className="mb-5" key={chapter.id}>
            <header className="mb-2 flex items-start justify-between gap-2 px-1">
              <div className="min-w-0">
                <strong className="block truncate text-[11px] font-semibold text-neutral-700">
                  {chapter.title}
                </strong>
                <span className="block truncate text-[9px] text-neutral-400">
                  {group.title}
                </span>
              </div>
              <span className="shrink-0 text-[9px] tabular-nums text-neutral-400">
                {measured ? `${pages.length} 页` : `第 ${chapterIndex + 1} 章`}
              </span>
            </header>

            {failed && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-700">
                <TriangleAlert size={12} />
                当前章节分页失败
              </div>
            )}

            {!measured && !failed && (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((item) => (
                  <div className="aspect-[3/4] animate-pulse rounded-md border border-neutral-200 bg-white" key={item} />
                ))}
              </div>
            )}

            {pages.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {pages.map((page) => {
                  const active = page.chapterId === activeChapterId &&
                    page.chapterPageNumber ===
                      (activeChapterPageNumber ?? 1);
                  return (
                    <div
                      className={cn(
                        "group/page relative aspect-[3/4] cursor-grab rounded-md active:cursor-grabbing",
                        dropTargetKey === page.key &&
                          "ring-2 ring-violet-400 ring-offset-2",
                      )}
                      key={page.key}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", page.key);
                        setDraggedPage(page);
                      }}
                      onDragEnd={() => {
                        setDraggedPage(null);
                        setDropTargetKey(null);
                      }}
                      onDragEnter={(event) => {
                        if (!draggedPage ||
                          draggedPage.chapterId !== page.chapterId ||
                          draggedPage.key === page.key) return;
                        event.preventDefault();
                        setDropTargetKey(page.key);
                      }}
                      onDragOver={(event) => {
                        if (draggedPage?.chapterId === page.chapterId &&
                          draggedPage.key !== page.key) {
                          event.preventDefault();
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedPage &&
                          draggedPage.chapterId === page.chapterId &&
                          draggedPage.key !== page.key) {
                          onMovePage(draggedPage, page);
                        }
                        setDraggedPage(null);
                        setDropTargetKey(null);
                      }}
                    >
                      <button
                        className={cn(
                          "relative size-full overflow-hidden rounded-md border bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                          active
                            ? "border-violet-500 ring-2 ring-violet-100"
                            : "border-neutral-200",
                        )}
                        type="button"
                        title={`${chapter.title} · 第 ${page.chapterPageNumber} 页 · 按住拖拽可调整顺序`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          onSelectPage(page);
                          if (window.innerWidth < 1024) onClose();
                        }}
                      >
                        <span className="absolute inset-x-2 top-2 bottom-6 overflow-hidden whitespace-pre-wrap font-serif text-[4px] leading-[1.75] text-neutral-500">
                          {page.previewText || "本页暂无正文"}
                        </span>
                        <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-between border-t border-neutral-100 px-1.5 text-[8px] text-neutral-400">
                          <span className="inline-flex items-center gap-0.5">
                            <FileText size={7} /> {page.chapterPageNumber}
                          </span>
                          <strong className={cn("font-medium", active && "text-violet-600")}>
                            {page.globalPageNumber}
                          </strong>
                        </span>
                      </button>
                      <button
                        className="absolute right-1 top-1 z-10 grid size-5 place-items-center rounded border border-neutral-200 bg-white/95 text-neutral-400 opacity-0 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/page:opacity-100"
                        type="button"
                        draggable={false}
                        title={`删除第 ${page.chapterPageNumber} 页`}
                        aria-label={`删除第 ${page.chapterPageNumber} 页`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeletePage({ page, chapterTitle: chapter.title });
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
                {measured && !failed && (
                  <button
                    className="group aspect-[3/4] rounded-md border border-dashed border-neutral-300 bg-neutral-50/70 text-neutral-400 transition hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    type="button"
                    title={`在“${chapter.title}”末尾新建一页`}
                    onClick={() => {
                      onCreatePage(chapter.id, pages.length + 1);
                      if (window.innerWidth < 1024) onClose();
                    }}
                  >
                    <span className="mx-auto grid size-7 place-items-center rounded-full border border-current transition group-hover:bg-white">
                      <Plus size={14} />
                    </span>
                    <span className="mt-2 block text-[9px] font-medium">
                      新建页面
                    </span>
                  </button>
                )}
              </div>
            )}
          </section>
        );
      }))}

      {pagination.running && (
        <div className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-neutral-400">
          <LoaderCircle className="animate-spin" size={12} />
          正在排版剩余章节…
        </div>
      )}

      {deletePage && (
        <DeleteBookItemDialog
          target={{
            kind: "page",
            title: deletePage.chapterTitle,
            chapterPageNumber: deletePage.page.chapterPageNumber,
          }}
          onClose={() => setDeletePage(null)}
          onConfirm={async () => onDeletePage(deletePage.page)}
        />
      )}
    </div>
  );
}
