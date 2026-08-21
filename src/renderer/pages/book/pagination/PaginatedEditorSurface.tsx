import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import {
  ArrowDown,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../../../../lib/utils.ts";
import {
  calculateChapterPageScale,
  CHAPTER_PAGE_SPEC,
  type ChapterPaginationSnapshot,
} from "./paginationModel.ts";
import {
  chapterPageContainsPosition,
  editablePositionInChapterPage,
} from "./useChapterPagination.ts";
import "./pagination.css";

type PaginatedEditorSurfaceProps = {
  readonly editor: Editor | null;
  readonly chapterNumber: number;
  readonly snapshot: ChapterPaginationSnapshot;
  readonly activePageIndex: number;
  readonly navigationRequestId: number | null;
  readonly navigationPageIndex: number | null;
  readonly onActivePageChange: (pageIndex: number) => void;
  readonly onInsertPageBreak: () => void;
};

type ChapterPageLayoutMode = "horizontal" | "vertical";

const PAGE_LAYOUT_STORAGE_KEY = "storyos:chapter-page-layout";

function initialPageLayoutMode(): ChapterPageLayoutMode {
  if (typeof window === "undefined") return "vertical";
  return window.localStorage.getItem(PAGE_LAYOUT_STORAGE_KEY) === "horizontal"
    ? "horizontal"
    : "vertical";
}

export default function PaginatedEditorSurface({
  editor,
  chapterNumber,
  snapshot,
  activePageIndex,
  navigationRequestId,
  navigationPageIndex,
  onActivePageChange,
  onInsertPageBreak,
}: PaginatedEditorSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const programmaticScroll = useRef(false);
  const releaseScrollFrame = useRef<number | null>(null);
  const handledNavigationRequestId = useRef<number | null>(null);
  const activePageIndexRef = useRef(activePageIndex);
  const lastHorizontalWheelAt = useRef(0);
  const [scale, setScale] = useState(1);
  const [layoutMode, setLayoutMode] = useState<ChapterPageLayoutMode>(
    initialPageLayoutMode,
  );
  activePageIndexRef.current = activePageIndex;
  const pageCount = Math.max(1, snapshot.pages.length);
  const pageStride = CHAPTER_PAGE_SPEC.height + CHAPTER_PAGE_SPEC.pageGap;
  const stageHeight = pageCount * CHAPTER_PAGE_SPEC.height +
    (pageCount - 1) * CHAPTER_PAGE_SPEC.pageGap;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateScale = () => {
      const style = window.getComputedStyle(viewport);
      const availableWidth = viewport.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const availableHeight = layoutMode === "horizontal"
        ? viewport.clientHeight -
          Number.parseFloat(style.paddingTop) -
          Number.parseFloat(style.paddingBottom) - 16
        : Number.POSITIVE_INFINITY;
      const next = calculateChapterPageScale(
        Math.max(0, availableWidth),
        Math.max(0, availableHeight),
      );
      setScale((current) => Math.abs(current - next) < 0.005 ? current : next);
    };
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    updateScale();
    return () => observer.disconnect();
  }, [layoutMode]);

  const alignViewportToPage = useCallback((pageIndex: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    programmaticScroll.current = true;
    viewport.scrollTop = layoutMode === "vertical"
      ? pageIndex * pageStride * scale
      : 0;
    if (releaseScrollFrame.current !== null) {
      window.cancelAnimationFrame(releaseScrollFrame.current);
    }
    releaseScrollFrame.current = window.requestAnimationFrame(() => {
      releaseScrollFrame.current = window.requestAnimationFrame(() => {
        programmaticScroll.current = false;
        releaseScrollFrame.current = null;
      });
    });
  }, [layoutMode, pageStride, scale]);

  useLayoutEffect(() => {
    alignViewportToPage(activePageIndexRef.current);
  }, [alignViewportToPage]);

  useEffect(() => {
    window.localStorage.setItem(PAGE_LAYOUT_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    if (
      navigationRequestId === null ||
      navigationPageIndex === null ||
      handledNavigationRequestId.current === navigationRequestId ||
      navigationPageIndex >= pageCount
    ) return;
    handledNavigationRequestId.current = navigationRequestId;
    alignViewportToPage(Math.max(0, navigationPageIndex));
  }, [
    alignViewportToPage,
    navigationPageIndex,
    navigationRequestId,
    pageCount,
  ]);

  useEffect(() => () => {
    if (scrollFrame.current !== null) {
      window.cancelAnimationFrame(scrollFrame.current);
    }
    if (releaseScrollFrame.current !== null) {
      window.cancelAnimationFrame(releaseScrollFrame.current);
    }
  }, []);

  const shellStyle = {
    width: CHAPTER_PAGE_SPEC.width * scale,
    height: (layoutMode === "horizontal"
      ? CHAPTER_PAGE_SPEC.height
      : stageHeight) * scale,
  } satisfies CSSProperties;
  const stageStyle = {
    width: CHAPTER_PAGE_SPEC.width,
    height: stageHeight,
    minHeight: stageHeight,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    top: layoutMode === "horizontal"
      ? -activePageIndex * pageStride * scale
      : 0,
    "--chapter-pagination-stage-height": `${stageHeight}px`,
  } as CSSProperties;

  const keepPointerInClickedPage = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.button !== 0 ||
      !editor ||
      editor.isDestroyed ||
      snapshot.status !== "ready"
    ) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;
    const stage = stageRef.current;
    if (!stage) return;
    const sheets = Array.from(
      stage.querySelectorAll<HTMLElement>(".chapter-pagination-sheet"),
    );
    const clickedPageIndex = sheets.findIndex((sheet) => {
      const rect = sheet.getBoundingClientRect();
      return event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
    });
    if (clickedPageIndex < 0 || !snapshot.pages[clickedPageIndex]) return;

    const mapped = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (mapped && chapterPageContainsPosition(
      snapshot,
      clickedPageIndex,
      mapped.pos,
    )) return;

    const page = snapshot.pages[clickedPageIndex];
    const sheetRect = sheets[clickedPageIndex].getBoundingClientRect();
    const edge = mapped
      ? (mapped.pos < page.from ? "start" : "end")
      : (event.clientY < (sheetRect.top + sheetRect.bottom) / 2
        ? "start"
        : "end");
    const position = editablePositionInChapterPage(
      editor.state.doc,
      snapshot,
      clickedPageIndex,
      edge,
    );
    if (position === null) return;

    event.preventDefault();
    editor.chain().focus().setTextSelection(position).run();
    if (clickedPageIndex !== activePageIndex) {
      onActivePageChange(clickedPageIndex);
    }
  };

  return (
    <div
      ref={viewportRef}
      className={cn(
        "chapter-pagination-viewport relative min-h-0 flex-1 px-[clamp(12px,2vw,32px)] py-[clamp(16px,2vw,28px)]",
        layoutMode === "horizontal"
          ? "chapter-pagination-viewport-horizontal overflow-hidden"
          : "chapter-pagination-viewport-vertical overflow-y-auto overflow-x-hidden",
      )}
      onScroll={() => {
        if (layoutMode !== "vertical") {
          const viewport = viewportRef.current;
          if (viewport && viewport.scrollTop !== 0) viewport.scrollTop = 0;
          return;
        }
        if (programmaticScroll.current) return;
        if (scrollFrame.current !== null) return;
        scrollFrame.current = window.requestAnimationFrame(() => {
          scrollFrame.current = null;
          const viewport = viewportRef.current;
          if (!viewport) return;
          const center = (viewport.scrollTop + viewport.clientHeight / 2) /
            scale;
          const nextIndex = Math.max(
            0,
            Math.min(pageCount - 1, Math.floor(center / pageStride)),
          );
          if (nextIndex !== activePageIndex) onActivePageChange(nextIndex);
        });
      }}
      onWheel={(event) => {
        if (layoutMode !== "horizontal") return;
        event.preventDefault();
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
        const now = window.performance.now();
        if (Math.abs(delta) < 8 || now - lastHorizontalWheelAt.current < 180) {
          return;
        }
        lastHorizontalWheelAt.current = now;
        onActivePageChange(Math.max(
          0,
          Math.min(pageCount - 1, activePageIndex + (delta > 0 ? 1 : -1)),
        ));
      }}
    >
      <div
        className="chapter-pagination-layout-switch sticky top-2 z-40 ml-auto -mb-8 flex w-fit items-center rounded-lg border border-neutral-200 bg-white/95 p-0.5 shadow-sm backdrop-blur"
        role="group"
        aria-label="页面布局模式"
      >
        <button
          className={cn(
            "grid size-7 place-items-center rounded-md border-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
            layoutMode === "horizontal"
              ? "bg-violet-50 text-violet-700"
              : "bg-transparent text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700",
          )}
          type="button"
          title="横向逐页"
          aria-label="切换为横向逐页布局"
          aria-pressed={layoutMode === "horizontal"}
          onClick={() => setLayoutMode("horizontal")}
        >
          <ArrowLeftRight size={13} />
        </button>
        <button
          className={cn(
            "grid size-7 place-items-center rounded-md border-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
            layoutMode === "vertical"
              ? "bg-violet-50 text-violet-700"
              : "bg-transparent text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700",
          )}
          type="button"
          title="纵向连续"
          aria-label="切换为纵向连续滚动布局"
          aria-pressed={layoutMode === "vertical"}
          onClick={() => setLayoutMode("vertical")}
        >
          <ArrowDown size={13} />
        </button>
      </div>

      {layoutMode === "horizontal" && (
        <>
          <button
            className="chapter-pagination-page-arrow left-3"
            type="button"
            title="上一页"
            aria-label="上一页"
            disabled={activePageIndex <= 0}
            onClick={() => onActivePageChange(activePageIndex - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="chapter-pagination-page-arrow right-3"
            type="button"
            title="下一页"
            aria-label="下一页"
            disabled={activePageIndex >= pageCount - 1}
            onClick={() => onActivePageChange(activePageIndex + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      <div
        className={cn(
          "chapter-pagination-shell relative mx-auto",
          layoutMode === "horizontal" && "overflow-hidden",
        )}
        style={shellStyle}
        onPointerDownCapture={keepPointerInClickedPage}
      >
        <div
          ref={stageRef}
          className="chapter-pagination-stage absolute left-0"
          style={stageStyle}
        >
          <div className="chapter-pagination-sheets" aria-hidden="true">
            {Array.from({ length: pageCount }, (_, pageIndex) => (
              <div
                className="chapter-pagination-sheet absolute left-0"
                key={pageIndex}
                style={{ top: pageIndex * pageStride }}
              >
                <footer className="chapter-pagination-footer absolute inset-x-[72px] bottom-0 flex h-[54px] items-center justify-between border-t text-[10px]">
                  <span>第 {chapterNumber} 章</span>
                  <strong className="font-medium tabular-nums text-neutral-500">
                    第 {pageIndex + 1} / {pageCount} 页
                  </strong>
                  <span>StoryOS</span>
                </footer>
              </div>
            ))}
          </div>

          <EditorContent
            className="chapter-pagination-editor absolute inset-0 z-10"
            editor={editor}
          />

          <button
            className="chapter-pagination-insert-break absolute z-20 inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-500 shadow-sm transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
            style={{
              left: CHAPTER_PAGE_SPEC.width - CHAPTER_PAGE_SPEC.marginRight - 48,
              top: activePageIndex * pageStride + CHAPTER_PAGE_SPEC.height - 42,
            }}
            type="button"
            title="从光标处换页（Ctrl/Cmd + Enter）"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onInsertPageBreak}
          >
            <Plus size={10} />
            换页
          </button>
        </div>
      </div>

      <div className={cn(
        "z-30 mx-auto w-fit rounded-full border border-neutral-200 bg-white/95 px-3 py-1 text-[10px] tabular-nums text-neutral-500 shadow-sm backdrop-blur",
        snapshot.status === "failed" &&
          "border-red-200 bg-red-50/95 text-red-700",
        layoutMode === "horizontal"
          ? "absolute bottom-2 left-1/2 -translate-x-1/2"
          : "sticky bottom-2 mt-2",
      )}>
        {snapshot.status === "failed"
          ? `排版失败：${snapshot.error ?? "未知错误"}`
          : `第 ${activePageIndex + 1} 页，共 ${pageCount} 页${
            snapshot.status === "pending" ? " · 正在排版" : ""
          }`}
      </div>
    </div>
  );
}
