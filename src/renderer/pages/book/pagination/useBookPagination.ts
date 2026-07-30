import { Editor, type Content } from "@tiptap/core";
import { useEffect, useState } from "react";
import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";
import { decodeStoredChapterContent } from "../../../../shared/book/richText.ts";
import { createChapterEditorExtensions } from "../editor/chapterEditorExtensions.ts";
import "../editor/chapterEditor.css";
import {
  BOOK_PAGE_COLUMN_GAP,
  BOOK_PAGE_CONTENT_WIDTH,
  BOOK_PAGE_STRIDE,
  clampChapterEditablePosition,
  createChapterPaginationCacheKey,
  numberBookPages,
  type BookPageSlice,
  type ChapterPageMeasurement,
} from "./bookPagination.ts";

type BookPaginationState = {
  readonly pages: readonly BookPageSlice[];
  readonly measuredChapterIds: ReadonlySet<string>;
  readonly failedChapterIds: ReadonlySet<string>;
  readonly running: boolean;
};

const measurementCache = new Map<
  string,
  readonly ChapterPageMeasurement[]
>();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function pageIndexAtPosition(
  editor: Editor,
  requestedPosition: number,
): number {
  const position = clampChapterEditablePosition(
    requestedPosition,
    editor.state.doc.content.size,
  );
  const rootLeft = editor.view.dom.getBoundingClientRect().left;
  const positionLeft = editor.view.coordsAtPos(position).left;
  return Math.max(
    0,
    Math.floor((positionLeft - rootLeft) / BOOK_PAGE_STRIDE),
  );
}

function findPageStart(
  editor: Editor,
  targetPageIndex: number,
  documentSize: number,
): number {
  if (targetPageIndex <= 0) return 0;
  let low = 1;
  let high = Math.max(1, documentSize - 1);
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
}

async function measureChapter(
  chapter: BookWorkspaceChapterDto,
): Promise<readonly ChapterPageMeasurement[]> {
  const host = document.createElement("div");
  host.className = "book-pagination-measure-host";
  host.style.width = `${BOOK_PAGE_CONTENT_WIDTH}px`;
  document.body.append(host);

  const editor = new Editor({
    element: host,
    extensions: createChapterEditorExtensions(),
    content: decodeStoredChapterContent(chapter.content) as unknown as Content,
    editable: false,
    editorProps: {
      attributes: {
        class: "chapter-rich-text book-pagination-rich-text",
        "aria-hidden": "true",
      },
    },
  });

  try {
    await document.fonts.ready;
    await nextFrame();
    const documentSize = editor.state.doc.content.size;
    const measurements: ChapterPageMeasurement[] = [];
    const pageCount = Math.max(
      1,
      Math.round(
        (editor.view.dom.scrollWidth + BOOK_PAGE_COLUMN_GAP) /
          BOOK_PAGE_STRIDE,
      ),
    );

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const start = findPageStart(editor, pageIndex, documentSize);
      const end = pageIndex === pageCount - 1
        ? documentSize
        : findPageStart(editor, pageIndex + 1, documentSize);
      const chapterPageNumber = pageIndex + 1;
      measurements.push({
        key: `${chapter.id}:${chapter.currentRevisionId ?? "draft"}:${chapterPageNumber}`,
        chapterId: chapter.id,
        revisionId: chapter.currentRevisionId,
        chapterPageNumber,
        from: start,
        to: end,
        previewText: editor.state.doc.textBetween(start, end, "\n", "\n").trim(),
      });
    }
    return measurements;
  } finally {
    editor.destroy();
    host.remove();
  }
}

export default function useBookPagination(
  chapters: readonly BookWorkspaceChapterDto[],
): BookPaginationState {
  const [state, setState] = useState<BookPaginationState>({
    pages: [],
    measuredChapterIds: new Set(),
    failedChapterIds: new Set(),
    running: chapters.length > 0,
  });

  useEffect(() => {
    let cancelled = false;
    const measurements = new Map<
      string,
      readonly ChapterPageMeasurement[]
    >();
    const measuredChapterIds = new Set<string>();
    const failedChapterIds = new Set<string>();

    setState({
      pages: [],
      measuredChapterIds,
      failedChapterIds,
      running: chapters.length > 0,
    });

    const run = async () => {
      for (const chapter of chapters) {
        if (cancelled) return;
        const cacheKey = createChapterPaginationCacheKey(chapter);
        try {
          let pages = measurementCache.get(cacheKey);
          if (!pages) {
            pages = await measureChapter(chapter);
            measurementCache.set(cacheKey, pages);
          }
          measurements.set(chapter.id, pages);
          measuredChapterIds.add(chapter.id);
        } catch {
          failedChapterIds.add(chapter.id);
        }
        if (cancelled) return;
        setState({
          pages: numberBookPages(chapters, measurements),
          measuredChapterIds: new Set(measuredChapterIds),
          failedChapterIds: new Set(failedChapterIds),
          running: measuredChapterIds.size + failedChapterIds.size < chapters.length,
        });
        await nextFrame();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [chapters]);

  return state;
}
