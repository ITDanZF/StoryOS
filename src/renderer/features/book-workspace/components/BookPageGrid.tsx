import {
  FileText,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import type { ChapterGenerationView } from "../../agent/types.ts";
import { applyChapterGenerationPreviews } from "./bookPageGridModel.ts";
import { useGenerationJobs } from "../store/generationStore.ts";

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

function usableGenerationPreview(
  generation: ChapterGenerationView | undefined,
): string | null {
  return generation &&
      generation.status !== "failed" &&
      generation.status !== "cancelled"
    ? generation.previewContent ?? null
    : null;
}

function useStablePaginationChapters(
  chapters: readonly ReturnType<typeof flattenBookChapterGroups>[number][],
  generations: Readonly<Record<string, ChapterGenerationView>>,
) {
  const cache = useRef<{
    readonly source: readonly ReturnType<typeof flattenBookChapterGroups>[number][];
    readonly previews: readonly (string | null)[];
    readonly result: ReturnType<typeof applyChapterGenerationPreviews>;
  } | null>(null);
  const previews = chapters.map((chapter) =>
    usableGenerationPreview(generations[chapter.id]));
  const previous = cache.current;
  const unchanged = previous !== null &&
    previous.source.length === chapters.length &&
    chapters.every((chapter, index) =>
      previous.source[index] === chapter && previous.previews[index] === previews[index]);
  if (unchanged) return previous.result;
  const result = applyChapterGenerationPreviews(chapters, generations);
  cache.current = { source: chapters, previews, result };
  return result;
}

function NewPageButton({
  chapterTitle,
  pageCount,
  generation,
  onCreate,
}: {
  readonly chapterTitle: string;
  readonly pageCount: number;
  readonly generation: ChapterGenerationView | null;
  readonly onCreate: () => void;
}) {
  const generating = generation?.status === "generating";
  return (
    <button
      className="group relative aspect-[3/4] overflow-hidden rounded-md border border-dashed border-border-strong bg-surface-subtle/70 text-text-subtle transition hover:border-accent-border hover:bg-accent/50 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:cursor-default"
      type="button"
      disabled={generating}
      title={generating
        ? `AI 正在为“${chapterTitle}”生成第 ${generation.publishedPageCount + 1} 页`
        : `在“${chapterTitle}”末尾新建一页`}
      onClick={onCreate}
    >
      <span className={cn("transition-opacity", generating && "group-hover:opacity-0")}>
        <span className="mx-auto grid size-7 place-items-center rounded-full border border-current transition group-hover:bg-card">
          {generating ? <Sparkles size={14} /> : <Plus size={14} />}
        </span>
        <span className="mt-2 block text-xs font-medium">
          {generating
            ? `AI 生成中 · ${generation.publishedPageCount} 页已更新`
            : "新建页面"}
        </span>
      </span>
      {generating && (
        <span className="pointer-events-none absolute inset-1 flex flex-col rounded bg-card/95 p-2 text-left opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-accent-foreground">
            <Sparkles size={9} /> AI 思考过程
          </span>
          <span className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap text-xs leading-4 text-text-secondary">
            {generation.thinkingText || "正在分析章节上下文并组织下一页内容…"}
          </span>
          <span className="mt-1 text-xs tabular-nums text-text-subtle">
            已生成 {generation.generatedCharacterCount.toLocaleString("zh-CN")} 字
          </span>
        </span>
      )}
      <span className="sr-only">第 {pageCount + 1} 页</span>
    </button>
  );
}

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
  const chapterGenerations = useGenerationJobs();
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
  const paginationChapters = useStablePaginationChapters(
    orderedChapters,
    chapterGenerations,
  );
  const pagination = useBookPagination(paginationChapters, livePagination);
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
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-xs text-text-subtle">
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
        const unloaded = pagination.unloadedChapterIds.has(chapter.id);
        const generation = chapterGenerations[chapter.id];
        const generating = generation?.status === "generating";
        return (
          <section className="mb-5" key={chapter.id}>
            <header className="mb-2 flex items-start justify-between gap-2 px-1">
              <div className="min-w-0">
                <strong className="block truncate text-xs font-semibold text-text-secondary">
                  {chapter.title}
                </strong>
                <span className="block truncate text-xs text-text-subtle">
                  {group.title}
                </span>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-text-subtle">
                {measured
                  ? `${pages.length} 页`
                  : unloaded
                    ? "未排版"
                    : `第 ${chapterIndex + 1} 章`}
              </span>
            </header>

            {failed && (
              <div className="flex items-center gap-1.5 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-2 text-xs text-warning-text">
                <TriangleAlert size={12} />
                当前章节分页失败
              </div>
            )}

            {unloaded && (generating ? (
              <div className="grid grid-cols-2 gap-2">
                <NewPageButton
                  chapterTitle={chapter.title}
                  pageCount={0}
                  generation={generation ?? null}
                  onCreate={() => {
                    onCreatePage(chapter.id, 1);
                    if (window.innerWidth < 1024) onClose();
                  }}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-surface-subtle/70 px-2.5 py-3 text-center text-xs text-text-subtle">
                打开章节后生成页面预览
              </div>
            ))}

            {!measured && !failed && !unloaded && (
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
                        <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-between border-t border-border px-1.5 text-xs text-text-subtle">
                          <span className="inline-flex items-center gap-0.5">
                            <FileText size={7} /> {page.chapterPageNumber}
                          </span>
                          <strong className={cn("font-medium", active && "text-accent-foreground")}>
                            {page.globalPageNumber ?? "—"}
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
                  <NewPageButton
                    chapterTitle={chapter.title}
                    pageCount={pages.length}
                    generation={generating ? generation ?? null : null}
                    onCreate={() => {
                      onCreatePage(chapter.id, pages.length + 1);
                      if (window.innerWidth < 1024) onClose();
                    }}
                  />
                )}
              </div>
            )}
          </section>
        );
      }))}

      {pagination.running && (
        <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-text-subtle">
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
