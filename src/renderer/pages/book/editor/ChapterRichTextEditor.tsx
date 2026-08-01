import type { Content, Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type { BookSaveState } from "../bookWorkspaceModel.ts";
import {
  BOOK_PAGE_COLUMN_GAP,
  BOOK_PAGE_LAYOUT,
  BOOK_PAGE_STRIDE,
  calculateBookPageScale,
  clampChapterEditablePosition,
  type BookPageNavigationTarget,
} from "../pagination/bookPagination.ts";
import "./chapterEditor.css";
import { createChapterEditorExtensions } from "./chapterEditorExtensions.ts";
import ChapterEditorToolbar from "./ChapterEditorToolbar.tsx";

const PAGE_HORIZONTAL_CONTROL_SPACE = 80;
const PAGE_VERTICAL_LABEL_SPACE = 34;

type ChapterRichTextEditorProps = {
  readonly chapterNumber: number;
  readonly content: string;
  readonly pageTarget: BookPageNavigationTarget | null;
  readonly onPageChange: (chapterPageNumber: number) => void;
  readonly onSave: (content: string) => Promise<void>;
  readonly onSaveStateChange: (state: BookSaveState) => void;
  readonly onCharacterCountChange: (count: number) => void;
  readonly onAskAiSelection: (selection: string | null) => void;
};

export default function ChapterRichTextEditor({
  chapterNumber,
  content,
  pageTarget,
  onPageChange,
  onSave,
  onSaveStateChange,
  onCharacterCountChange,
  onAskAiSelection,
}: ChapterRichTextEditorProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [pageScale, setPageScale] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const pageCountRef = useRef(1);
  const activePageIndexRef = useRef(0);
  const layoutFrame = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingContent = useRef<string | null>(null);
  const lastSavedContent = useRef(content);
  const saveSequence = useRef(Promise.resolve());
  const onSaveRef = useRef(onSave);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onCharacterCountChangeRef = useRef(onCharacterCountChange);
  const onPageChangeRef = useRef(onPageChange);
  onSaveRef.current = onSave;
  onSaveStateChangeRef.current = onSaveStateChange;
  onCharacterCountChangeRef.current = onCharacterCountChange;
  onPageChangeRef.current = onPageChange;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updatePageScale = () => {
      const style = window.getComputedStyle(canvas);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const availableWidth = Math.max(
        0,
        canvas.clientWidth - horizontalPadding - PAGE_HORIZONTAL_CONTROL_SPACE,
      );
      const availableHeight = Math.max(
        0,
        canvas.clientHeight - verticalPadding - PAGE_VERTICAL_LABEL_SPACE,
      );
      const nextScale = calculateBookPageScale(
        availableWidth,
        availableHeight,
      );
      setPageScale((current) =>
        Math.abs(current - nextScale) < 0.005 ? current : nextScale);
    };

    const observer = new ResizeObserver(updatePageScale);
    observer.observe(canvas);
    updatePageScale();
    return () => observer.disconnect();
  }, []);

  const persist = useCallback((serialized: string) => {
    if (serialized === lastSavedContent.current) {
      pendingContent.current = null;
      onSaveStateChangeRef.current("saved");
      return;
    }
    onSaveStateChangeRef.current("saving");
    saveSequence.current = saveSequence.current
      .catch((): void => undefined)
      .then(() => onSaveRef.current(serialized))
      .then(() => {
        lastSavedContent.current = serialized;
        if (pendingContent.current === serialized) {
          pendingContent.current = null;
          onSaveStateChangeRef.current("saved");
        }
      })
      .catch(() => {
        onSaveStateChangeRef.current("error");
      });
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingContent.current !== null) {
      persist(pendingContent.current);
    }
  }, [persist]);

  const activatePage = useCallback((requestedIndex: number) => {
    const nextIndex = Math.max(
      0,
      Math.min(requestedIndex, pageCountRef.current - 1),
    );
    activePageIndexRef.current = nextIndex;
    setActivePageIndex(nextIndex);
    onPageChangeRef.current(nextIndex + 1);
  }, []);

  const pageIndexAtPosition = useCallback((
    current: Editor,
    requestedPosition: number,
  ): number => {
    const position = clampChapterEditablePosition(
      requestedPosition,
      current.state.doc.content.size,
    );
    const rootLeft = current.view.dom.getBoundingClientRect().left;
    const positionLeft = current.view.coordsAtPos(position).left;
    return Math.max(0, Math.floor((positionLeft - rootLeft) / BOOK_PAGE_STRIDE));
  }, []);

  const schedulePageLayout = useCallback((current: Editor) => {
    if (layoutFrame.current !== null) {
      window.cancelAnimationFrame(layoutFrame.current);
    }
    layoutFrame.current = window.requestAnimationFrame(() => {
      layoutFrame.current = null;
      if (current.isDestroyed) return;
      const nextPageCount = Math.max(
        1,
        Math.round(
          (current.view.dom.scrollWidth + BOOK_PAGE_COLUMN_GAP) /
            BOOK_PAGE_STRIDE,
        ),
      );
      pageCountRef.current = nextPageCount;
      setPageCount(nextPageCount);
      activatePage(Math.min(
        pageIndexAtPosition(current, current.state.selection.from),
        nextPageCount - 1,
      ));
    });
  }, [activatePage, pageIndexAtPosition]);

  const editor = useEditor({
    extensions: createChapterEditorExtensions(),
    content: decodeStoredChapterContent(content) as unknown as Content,
    editorProps: {
      attributes: {
        class: "chapter-rich-text",
        "aria-label": "章节正文",
        spellcheck: "false",
      },
    },
    onCreate: ({ editor: current }) => {
      onCharacterCountChangeRef.current(
        countTiptapCharacters(current.getJSON()),
      );
      schedulePageLayout(current);
    },
    onUpdate: ({ editor: current }) => {
      const document = current.getJSON();
      const serialized = serializeTiptapDocument(document);
      pendingContent.current = serialized;
      onCharacterCountChangeRef.current(countTiptapCharacters(document));
      onSaveStateChangeRef.current("saving");
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        persist(serialized);
      }, 800);
      schedulePageLayout(current);
    },
    onSelectionUpdate: ({ editor: current }) => {
      activatePage(pageIndexAtPosition(
        current,
        current.state.selection.from,
      ));
    },
    onBlur: flush,
  });

  useEffect(() => {
    if (!editor || !pageTarget) return;
    if (pageTarget.chapterPageNumber > pageCountRef.current) {
      pageCountRef.current = pageTarget.chapterPageNumber;
      setPageCount(pageTarget.chapterPageNumber);
    }
    activatePage(pageTarget.chapterPageNumber - 1);
    const frame = window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const position = clampChapterEditablePosition(
        pageTarget.position,
        editor.state.doc.content.size,
      );
      editor.chain()
        .focus()
        .setTextSelection(position)
        .run();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activatePage, editor, pageTarget]);

  useEffect(() => () => {
    if (layoutFrame.current !== null) {
      window.cancelAnimationFrame(layoutFrame.current);
      layoutFrame.current = null;
    }
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingContent.current;
    if (pending !== null && pending !== lastSavedContent.current) {
      void onSaveRef.current(pending);
    }
  }, []);

  const positionForPage = (targetPageIndex: number): number => {
    if (!editor || targetPageIndex <= 0) return 1;
    let low = 1;
    let high = Math.max(1, editor.state.doc.content.size - 1);
    let result = high;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (pageIndexAtPosition(editor, middle) >= targetPageIndex) {
        result = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    return result;
  };

  const goToPage = (targetPageIndex: number) => {
    if (!editor || editor.isDestroyed) return;
    const nextPageIndex = Math.max(
      0,
      Math.min(targetPageIndex, pageCountRef.current - 1),
    );
    activatePage(nextPageIndex);
    const position = positionForPage(nextPageIndex);
    window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      editor.chain().focus().setTextSelection(position).run();
    });
  };

  const insertPageBreak = () => {
    if (!editor || editor.isDestroyed) return;
    editor.chain().focus().insertContent([
      { type: "pageBreak" },
      { type: "paragraph" },
    ]).run();
    schedulePageLayout(editor);
  };

  const goToNextPage = () => {
    if (activePageIndex < pageCount - 1) {
      goToPage(activePageIndex + 1);
      return;
    }
    insertPageBreak();
  };

  const askAi = () => {
    if (!editor || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const selection = from === to
      ? null
      : editor.state.doc.textBetween(from, to, "\n").trim() || null;
    onAskAiSelection(selection);
  };

  const pageOffsetStyle = {
    "--chapter-page-offset": `${-activePageIndex * BOOK_PAGE_STRIDE}px`,
  } as CSSProperties;
  const pageShellStyle = {
    width: BOOK_PAGE_LAYOUT.width * pageScale,
    height: BOOK_PAGE_LAYOUT.height * pageScale,
  } satisfies CSSProperties;
  const pageSurfaceStyle = {
    width: BOOK_PAGE_LAYOUT.width,
    height: BOOK_PAGE_LAYOUT.height,
    transform: `scale(${pageScale})`,
    transformOrigin: "top left",
  } satisfies CSSProperties;

  return (
    <>
      <ChapterEditorToolbar editor={editor} onAskAi={askAi} />
      <div
        ref={canvasRef}
        className="chapter-editor-canvas min-h-0 flex-1 overflow-auto px-[clamp(12px,2vw,32px)] pb-14 pt-[clamp(16px,2vw,28px)]"
      >
        <div
          className="chapter-editor-page-shell relative mx-auto shrink-0"
          style={pageShellStyle}
        >
          <button
            className="chapter-page-arrow absolute left-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-md transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-30 xl:-left-12"
            type="button"
            aria-label="上一页"
            disabled={activePageIndex === 0}
            onClick={() => goToPage(activePageIndex - 1)}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="absolute left-0 top-0" style={pageSurfaceStyle}>
            <div className="chapter-editor-paper relative h-[960px] w-[720px] overflow-hidden rounded-md border bg-white">
              <div
                className="chapter-editor-page-content absolute left-[72px] top-[72px] h-[816px] w-[576px] overflow-hidden"
                style={pageOffsetStyle}
              >
                <EditorContent className="h-full w-full" editor={editor} />
              </div>
              <footer className="chapter-editor-footer absolute inset-x-[72px] bottom-0 flex h-[54px] items-center justify-between border-t text-[10px]">
                <span>第 {chapterNumber} 章</span>
                <strong className="font-medium tabular-nums text-neutral-500">
                  第 {activePageIndex + 1} / {pageCount} 页
                </strong>
                <button
                  className="inline-flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-[10px] text-neutral-500 transition hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                  type="button"
                  title="从光标处换页（Ctrl/Cmd + Enter）"
                  onClick={insertPageBreak}
                >
                  <Plus size={10} />
                  换页
                </button>
              </footer>
            </div>
          </div>

          <button
            className="chapter-page-arrow absolute right-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-md transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-30 xl:-right-12"
            type="button"
            aria-label={activePageIndex >= pageCount - 1
              ? "新建下一页"
              : "下一页"}
            title={activePageIndex >= pageCount - 1
              ? "新建下一页"
              : "下一页"}
            onClick={goToNextPage}
          >
            <ChevronRight size={18} />
          </button>

          <div className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[10px] tabular-nums text-neutral-500 shadow-sm">
            第 {activePageIndex + 1} 页，共 {pageCount} 页
          </div>
        </div>
      </div>
    </>
  );
}
