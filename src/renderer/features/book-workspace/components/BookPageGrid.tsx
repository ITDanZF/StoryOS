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
} from "../../book-content/paginationModel.ts";
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
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-[11px] text-text-subtle">
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
                <strong className="block truncate text-[11px] font-semibold text-text-secondary">
                  {chapter.title}
                </strong>
                <span className="block truncate text-[9px] text-text-subtle">
                  {group.title}
                </span>
              </div>
              <span className="shrink-0 text-[9px] tabular-nums text-text-subtle">
                {measured ? `${pages.length} 页` : `第 ${chapterIndex + 1} 章`}
              </span>
            </header>

            {failed && (
              <div className="flex items-center gap-1.5 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-2 text-[10px] text-warning-text">
                <TriangleAlert size={12} />
                当前章节分页失败
              </div>
            )}

            {!measured && !failed && (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((item) => (
                  <div className="aspect-[3/4] animate-pulse rounded-md border border-border bg-card" key={item} />
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
                          "ring-2 ring-accent-border ring-offset-2",
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
                          "relative size-full overflow-hidden rounded-md border bg-card p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border",
                          active
                            ? "border-accent-border ring-2 ring-accent-border"
                            : "border-border",
                        )}
                        type="button"
                        title={`${chapter.title} · 第 ${page.chapterPageNumber} 页 · 按住拖拽可调整顺序`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          onSelectPage(page);
                          if (window.innerWidth < 1024) onClose();
                        }}
                      >
                        <span className="absolute inset-x-2 top-2 bottom-6 overflow-hidden whitespace-pre-wrap font-serif text-[4px] leading-[1.75] text-muted-foreground">
                          {page.previewText || "本页暂无正文"}
                        </span>
                        <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-between border-t border-border px-1.5 text-[8px] text-text-subtle">
                          <span className="inline-flex items-center gap-0.5">
                            <FileText size={7} /> {page.chapterPageNumber}
                          </span>
                          <strong className={cn("font-medium", active && "text-accent-foreground")}>
                            {page.globalPageNumber}
                          </strong>
                        </span>
                      </button>
                      <button
                        className="absolute right-1 top-1 z-10 grid size-5 place-items-center rounded border border-border bg-card/95 text-text-subtle opacity-0 shadow-sm transition hover:border-danger-border hover:bg-danger-surface hover:text-danger-text focus-visible:opacity-100 group-hover/page:opacity-100"
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
                    className="group aspect-[3/4] rounded-md border border-dashed border-border-strong bg-surface-subtle/70 text-text-subtle transition hover:border-accent-border hover:bg-accent/50 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
                    type="button"
                    title={`在“${chapter.title}”末尾新建一页`}
                    onClick={() => {
                      onCreatePage(chapter.id, pages.length + 1);
                      if (window.innerWidth < 1024) onClose();
                    }}
                  >
                    <span className="mx-auto grid size-7 place-items-center rounded-full border border-current transition group-hover:bg-card">
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
        <div className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-text-subtle">
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
