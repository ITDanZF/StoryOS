import { FileText, LoaderCircle, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import useBookPagination from "../pagination/useBookPagination.ts";
import type { BookPageSlice } from "../pagination/bookPagination.ts";

type BookPageGridProps = {
  readonly volumes: readonly VolumeDto[];
  readonly chapters: readonly BookWorkspaceChapterDto[];
  readonly activeChapterId: string | null;
  readonly activeChapterPageNumber: number | null;
  readonly onSelectPage: (page: BookPageSlice) => void;
  readonly onClose: () => void;
};

export default function BookPageGrid({
  volumes,
  chapters,
  activeChapterId,
  activeChapterPageNumber,
  onSelectPage,
  onClose,
}: BookPageGridProps) {
  const orderedChapters = useMemo(() => {
    const volumeOrder = new Map(
      [...volumes]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((volume, index) => [volume.id, index]),
    );
    return [...chapters].sort((left, right) => {
      const leftVolume = left.volumeId === null
        ? Number.MAX_SAFE_INTEGER
        : volumeOrder.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER;
      const rightVolume = right.volumeId === null
        ? Number.MAX_SAFE_INTEGER
        : volumeOrder.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER;
      return leftVolume - rightVolume || left.sortOrder - right.sortOrder;
    });
  }, [chapters, volumes]);
  const pagination = useBookPagination(orderedChapters);
  const pagesByChapter = useMemo(() => {
    const result = new Map<string, BookPageSlice[]>();
    for (const page of pagination.pages) {
      const pages = result.get(page.chapterId) ?? [];
      pages.push(page);
      result.set(page.chapterId, pages);
    }
    return result;
  }, [pagination.pages]);
  const volumeTitles = useMemo(
    () => new Map(volumes.map((volume) => [volume.id, volume.title])),
    [volumes],
  );

  if (chapters.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-[11px] text-neutral-400">
        新建章节并开始写作后，页面会显示在这里。
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3" aria-label="书籍页面">
      {orderedChapters.map((chapter, chapterIndex) => {
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
                  {chapter.volumeId ? volumeTitles.get(chapter.volumeId) : "未分卷"}
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
                    <button
                      className={cn(
                        "group relative aspect-[3/4] overflow-hidden rounded-md border bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                        active
                          ? "border-violet-500 ring-2 ring-violet-100"
                          : "border-neutral-200",
                      )}
                      type="button"
                      key={page.key}
                      title={`${chapter.title} · 第 ${page.chapterPageNumber} 页`}
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
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {pagination.running && (
        <div className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-neutral-400">
          <LoaderCircle className="animate-spin" size={12} />
          正在排版剩余章节…
        </div>
      )}
    </div>
  );
}
