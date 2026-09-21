import { useCallback, useRef, useState } from "react";
import type {
  BookPageNavigationTarget,
  BookPageSlice,
  LiveChapterPagination,
} from "../book-content/paginationModel.ts";

/** Chapter/page identity and navigation requests have one owner. */
export default function useBookNavigation() {
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const pageRequestId = useRef(0);
  const [activeChapterPageNumber, setActiveChapterPageNumber] = useState<
    number | null
  >(null);
  const [pageTarget, setPageTarget] = useState<BookPageNavigationTarget | null>(
    null,
  );
  const [livePagination, setLivePagination] =
    useState<LiveChapterPagination | null>(null);
  const activeChapterIdRef = useRef(activeChapterId);
  activeChapterIdRef.current = activeChapterId;
  const openChapterFromTool = useCallback(
    (chapterId: string, pageNumber: number) => {
      pageRequestId.current += 1;
      setActiveChapterId(chapterId);
      setActiveChapterPageNumber(pageNumber);
      setLivePagination(null);
      setPageTarget({
        kind: "navigate",
        chapterId,
        position: 1,
        chapterPageNumber: pageNumber,
        requestId: pageRequestId.current,
      });
    },
    [],
  );
  const revealChapter = useCallback(
    (chapterId: string, pageNumber = 1) => {
      if (activeChapterIdRef.current === chapterId) return;
      openChapterFromTool(chapterId, pageNumber);
    },
    [openChapterFromTool],
  );

  const selectChapter = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setActiveChapterPageNumber(1);
    setPageTarget(null);
    setLivePagination(null);
  };

  const showBookOverview = () => {
    setActiveChapterId(null);
    setActiveChapterPageNumber(null);
    setPageTarget(null);
    setLivePagination(null);
  };

  const selectBookPage = (page: BookPageSlice) => {
    pageRequestId.current += 1;
    setActiveChapterId(page.chapterId);
    if (page.chapterId !== activeChapterId) setLivePagination(null);
    setActiveChapterPageNumber(page.chapterPageNumber);
    setPageTarget({
      kind: "navigate",
      chapterId: page.chapterId,
      position: page.from,
      chapterPageNumber: page.chapterPageNumber,
      requestId: pageRequestId.current,
    });
  };

  const createBookPage = (chapterId: string, chapterPageNumber: number) => {
    pageRequestId.current += 1;
    setActiveChapterId(chapterId);
    if (chapterId !== activeChapterId) setLivePagination(null);
    setActiveChapterPageNumber(chapterPageNumber);
    setPageTarget({
      kind: "append",
      chapterId,
      chapterPageNumber,
      requestId: pageRequestId.current,
    });
  };

  const moveBookPage = (source: BookPageSlice, target: BookPageSlice) => {
    if (source.chapterId !== target.chapterId) return;
    pageRequestId.current += 1;
    setActiveChapterId(source.chapterId);
    if (source.chapterId !== activeChapterId) setLivePagination(null);
    setActiveChapterPageNumber(target.chapterPageNumber);
    setPageTarget({
      kind: "move",
      chapterId: source.chapterId,
      sourceChapterPageNumber: source.chapterPageNumber,
      targetChapterPageNumber: target.chapterPageNumber,
      requestId: pageRequestId.current,
    });
  };

  const deleteBookPage = (page: BookPageSlice) => {
    pageRequestId.current += 1;
    setActiveChapterId(page.chapterId);
    if (page.chapterId !== activeChapterId) setLivePagination(null);
    setActiveChapterPageNumber(page.chapterPageNumber);
    setPageTarget({
      kind: "delete",
      chapterId: page.chapterId,
      chapterPageNumber: page.chapterPageNumber,
      requestId: pageRequestId.current,
    });
  };

  return {
    activeChapterId,
    setActiveChapterId,
    activeChapterPageNumber,
    setActiveChapterPageNumber,
    pageTarget,
    livePagination,
    setLivePagination,
    openChapterFromTool,
    revealChapter,
    selectChapter,
    showBookOverview,
    selectBookPage,
    createBookPage,
    moveBookPage,
    deleteBookPage,
  };
}
