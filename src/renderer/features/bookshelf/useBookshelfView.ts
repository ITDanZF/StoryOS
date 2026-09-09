import { useEffect, useRef, useState } from "react";
import type { BookshelfView } from "./components/BookshelfToolbar.tsx";
const readerReturn = {
  pending: false,
  query: "",
  view: "grid" as BookshelfView,
  scrollTop: 0,
  focus: "",
};
export default function useBookshelfView(phase: "loading" | "ready" | "error") {
  const [view, setView] = useState<BookshelfView>(() =>
    readerReturn.pending ? readerReturn.view : "grid",
  );
  const [query, setQuery] = useState(() =>
    readerReturn.pending ? readerReturn.query : "",
  );
  const shelfScrollRef = useRef<HTMLDivElement>(null);
  const rememberReaderReturn = (bookId: string) => {
    Object.assign(readerReturn, {
      pending: true,
      query,
      view,
      scrollTop: shelfScrollRef.current?.scrollTop ?? 0,
      focus:
        (document.activeElement as HTMLElement)?.dataset.readerEntry ??
        `card-${bookId}`,
    });
  };
  useEffect(() => {
    if (!readerReturn.pending || phase === "loading") return;
    const frame = requestAnimationFrame(() => {
      if (shelfScrollRef.current)
        shelfScrollRef.current.scrollTop = readerReturn.scrollTop;
      document
        .querySelector<HTMLElement>(
          `[data-reader-entry="${CSS.escape(readerReturn.focus)}"]`,
        )
        ?.focus({ preventScroll: true });
      readerReturn.pending = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  return {
    view,
    setView,
    query,
    setQuery,
    shelfScrollRef,
    rememberReaderReturn,
  };
}
