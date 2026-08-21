import { Editor, type Content } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";
import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";
import { decodeStoredChapterContent } from "../../../../shared/book/richText.ts";
import { createChapterEditorExtensions } from "../editor/chapterEditorExtensions.ts";
import "../editor/chapterEditor.css";
import { measurePaginationFragments } from "./domPaginationMeasurer.ts";
import { paginateFragments } from "./paginationEngine.ts";
import {
  CHAPTER_PAGE_CONTENT_HEIGHT,
  CHAPTER_PAGE_SPEC,
  createChapterPaginationCacheKey,
  numberBookPages,
  type BookPageSlice,
  type ChapterPageMeasurement,
  type LiveChapterPagination,
} from "./paginationModel.ts";
import "./pagination.css";

export type BookPaginationState = {
  readonly pages: readonly BookPageSlice[];
  readonly measuredChapterIds: ReadonlySet<string>;
  readonly failedChapterIds: ReadonlySet<string>;
  readonly running: boolean;
};

type BackgroundPaginationState = Omit<BookPaginationState, "pages"> & {
  readonly measurements: ReadonlyMap<
    string,
    readonly ChapterPageMeasurement[]
  >;
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

async function measureChapter(
  chapter: BookWorkspaceChapterDto,
): Promise<readonly ChapterPageMeasurement[]> {
  const host = document.createElement("div");
  host.className = "book-pagination-measure-host";
  host.style.width = `${CHAPTER_PAGE_SPEC.width}px`;
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
    const documentEnd = Math.max(1, editor.state.doc.content.size - 1);
    const pages = paginateFragments({
      fragments: measurePaginationFragments(editor.view),
      contentHeight: CHAPTER_PAGE_CONTENT_HEIGHT,
      documentStart: 1,
      documentEnd,
    });
    return pages.map((page) => {
      const chapterPageNumber = page.index + 1;
      return {
        ...page,
        key: `${chapter.id}:${chapter.currentRevisionId ?? "draft"}:${chapterPageNumber}`,
        chapterId: chapter.id,
        revisionId: chapter.currentRevisionId,
        chapterPageNumber,
        previewText: editor.state.doc
          .textBetween(page.from, page.to, "\n", "\n")
          .trim(),
      };
    });
  } finally {
    editor.destroy();
    host.remove();
  }
}

export default function useBookPagination(
  chapters: readonly BookWorkspaceChapterDto[],
  livePagination: LiveChapterPagination | null = null,
): BookPaginationState {
  const [state, setState] = useState<BackgroundPaginationState>({
    measurements: new Map(),
    measuredChapterIds: new Set(),
    failedChapterIds: new Set(),
    running: chapters.length > 0,
  });

  useEffect(() => {
    let cancelled = false;
    const validCacheKeys = new Set(
      chapters.map(createChapterPaginationCacheKey),
    );
    for (const cacheKey of measurementCache.keys()) {
      if (!validCacheKeys.has(cacheKey)) measurementCache.delete(cacheKey);
    }
    const measurements = new Map<
      string,
      readonly ChapterPageMeasurement[]
    >();
    const measuredChapterIds = new Set<string>();
    const failedChapterIds = new Set<string>();

    setState({
      measurements: new Map(),
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
          measurements: new Map(measurements),
          measuredChapterIds: new Set(measuredChapterIds),
          failedChapterIds: new Set(failedChapterIds),
          running: measuredChapterIds.size + failedChapterIds.size <
            chapters.length,
        });
        await nextFrame();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [chapters]);

  const pages = useMemo(() => {
    if (!livePagination) {
      return numberBookPages(chapters, state.measurements);
    }
    const chapter = chapters.find(
      (item) => item.id === livePagination.chapterId,
    );
    if (!chapter) return numberBookPages(chapters, state.measurements);
    const measurements = new Map(state.measurements);
    measurements.set(chapter.id, livePagination.pages.map((page) => ({
      ...page,
      key: `${chapter.id}:live:${livePagination.layoutKey}:${page.index + 1}`,
      chapterId: chapter.id,
      revisionId: chapter.currentRevisionId,
      chapterPageNumber: page.index + 1,
    })));
    return numberBookPages(chapters, measurements);
  }, [chapters, livePagination, state.measurements]);

  const measuredChapterIds = new Set(state.measuredChapterIds);
  const failedChapterIds = new Set(state.failedChapterIds);
  if (livePagination && chapters.some(
    (chapter) => chapter.id === livePagination.chapterId,
  )) {
    measuredChapterIds.add(livePagination.chapterId);
    failedChapterIds.delete(livePagination.chapterId);
  }

  return {
    pages,
    measuredChapterIds,
    failedChapterIds,
    running: state.running,
  };
}
