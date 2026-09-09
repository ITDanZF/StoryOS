import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBookIndex, frontLeaves, neighborCursor, prepareBookSpread, type BookCursor, type BookSpread, type PageSize } from "./bookPresentation.ts";
import type useBookReader from "./useBookReader.ts";

export default function useReaderPresentation(reader: ReturnType<typeof useBookReader>, size: PageSize, double: boolean) {
  const [spread, setSpread] = useState<BookSpread | null>(null), [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<BookSpread | null>(null);
  const cursor = useRef<BookCursor | null>(null), version = useRef(0);
  const index = useMemo(() => reader.snapshot ? createBookIndex(reader.snapshot, reader.chapters, reader.pageCounts) : { entries: [], total: null }, [reader.snapshot, reader.chapters, reader.pageCounts]);
  const front = useMemo(() => frontLeaves(reader.snapshot?.book.title ?? "", index.entries, size), [reader.snapshot?.book.title, index.entries, size]);
  const prepare = useCallback((target: BookCursor) => prepareBookSpread(target, { title: reader.snapshot.book.title, chapters: reader.chapters, entries: index.entries, front, double, loadChapter: reader.loadChapter }), [reader.snapshot, reader.chapters, index.entries, front, double, reader.loadChapter]);
  const neighbor = useCallback((value: BookSpread, direction: number) => neighborCursor(value, direction), []);
  const previousLayout = useRef("");
  const previousLocation = useRef(reader.location);
  const firstCommit = useRef(true);
  const previousSnapshot = useRef("");
  useEffect(() => {
    if (!reader.snapshot || reader.busy) return;
    if (previousSnapshot.current !== reader.snapshot.snapshotId) {
      previousSnapshot.current = reader.snapshot.snapshotId; cursor.current = null; firstCommit.current = true;
    }
    const layout = `${size.width}:${size.height}:${reader.preferences.fontSize}:${reader.preferences.lineHeight}:${double}`;
    const relayout = previousLayout.current !== layout;
    previousLayout.current = layout;
    const location = reader.location;
    const sourceChanged = previousLocation.current !== location;
    previousLocation.current = location;
    const target: BookCursor = (relayout || sourceChanged) && location && (!cursor.current || cursor.current.kind === "chapter") ? { kind: "chapter", chapterId: location.chapter.chapterId, pageIndex: location.pageIndex } : cursor.current ?? (location ? { kind: "chapter", chapterId: location.chapter.chapterId, pageIndex: location.pageIndex } : { kind: reader.chapters.length ? "front" : "end", pageIndex: 0 });
    const id = ++version.current;
    void prepare(target).then(next => { if (id === version.current) { setSpread(previous => previous?.key === next.key ? previous : next); setError(null); } }).catch(cause => { if (id === version.current) setError(String(cause)); });
    return () => { version.current++; };
  }, [reader.snapshot, reader.busy, reader.location, reader.preferences.fontSize, reader.preferences.lineHeight, size, double, prepare]);
  const commit = (next: BookSpread) => {
    cursor.current = next.cursor; setSpread(next); setCommitted(next);
    if (next.location) {
      if (firstCommit.current && reader.snapshot.readingState?.anchor) reader.setCover(false);
      else reader.commit(next.location);
    } else reader.setCover(true);
    firstCommit.current = false;
  };
  return { spread, committed, prepare, neighbor, commit, index, front, error };
}

