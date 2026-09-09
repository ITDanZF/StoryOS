import { DEFAULT_PAGE_SIZE, type PageSize } from "./bookPresentation.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_READER_PREFERENCES, type ReaderAnchor, type ReaderPreferences, type ReaderSnapshot } from "../../../shared/book/reader.ts";
import { createReaderAnchor, orderedReaderChapters, pageAtPosition, ReaderChapterCache, restoreReaderAnchor, spreadStart,
  type MeasuredChapter } from "./readerModel.ts";
import { measureReaderChapter } from "./readerPagination.ts";

export type ReaderLocation = { chapter: MeasuredChapter; pageIndex: number };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function useBookReader(bookId: string, size: PageSize = DEFAULT_PAGE_SIZE, enabled = true) {
  const [snapshot, setSnapshot] = useState<ReaderSnapshot | null>(null);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [cover, setCover] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<"unchanged" | "changed" | "unavailable">("unchanged");
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [reload, setReload] = useState(0);
  const sizeRef = useRef(size); sizeRef.current = size;
  const sessionRef = useRef<ReaderSnapshot | null>(null);
  const preferencesRef = useRef(preferences);
  const locationRef = useRef(location);
  const abortRef = useRef(new AbortController());
  const cache = useRef(new ReaderChapterCache());
  const inFlight = useRef(new Map<string, Promise<MeasuredChapter>>());
  const sequence = useRef(0);
  const generation = useRef(0);
  const savedAnchor = useRef<ReaderAnchor | null>(null);
  const positionAnchor = useRef<ReaderAnchor | null>(null);
  const coverRef = useRef(cover);
  coverRef.current = cover;
  const countsRef = useRef<Record<string, number>>({});
  preferencesRef.current = preferences;
  locationRef.current = location;
  const chapters = useMemo(() => snapshot ? orderedReaderChapters(snapshot) : [], [snapshot]);

  const loadChapter = useCallback(async (chapterId: string): Promise<MeasuredChapter> => {
    const session = sessionRef.current;
    if (!session) throw new Error("阅读服务尚未就绪。");
    const prefs = preferencesRef.current;
    const key = `${session.snapshotId}:${chapterId}:${prefs.fontSize}:${prefs.lineHeight}:${sizeRef.current.width}x${sizeRef.current.height}`;
    const existing = cache.current.get(key);
    if (existing) return existing;
    const pending = inFlight.current.get(key);
    if (pending) return pending;
    const signal = abortRef.current.signal, pageSize = sizeRef.current;
    const request = (async () => {
      const source = await window.storyOSAgent.readBookReaderChapter({ snapshotId: session.snapshotId, chapterId });
      signal.throwIfAborted();
      const measured = await measureReaderChapter(chapterId, source, prefs, signal, pageSize);
      signal.throwIfAborted();
      cache.current.set(key, measured);
      if (sessionRef.current?.snapshotId === session.snapshotId && preferencesRef.current.fontSize === prefs.fontSize && preferencesRef.current.lineHeight === prefs.lineHeight && sizeRef.current.width === pageSize.width && sizeRef.current.height === pageSize.height) {
        countsRef.current = { ...countsRef.current, [chapterId]: measured.pages.length };
        setPageCounts(countsRef.current);
      }
      return measured;
    })();
    inFlight.current.set(key, request);
    try { return await request; } finally { if (inFlight.current.get(key) === request) inFlight.current.delete(key); }
  }, []);

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const current = locationRef.current;
    const anchor = positionAnchor.current ?? (current && !coverRef.current ? createReaderAnchor(current.chapter, current.chapter.pages[current.pageIndex]?.from ?? 1) : savedAnchor.current);
    const savedSequence = ++sequence.current;
    await window.storyOSAgent.saveBookReadingState({ snapshotId: session.snapshotId, sequence: savedSequence,
      anchor, preferences: preferencesRef.current });
    if (savedSequence === sequence.current && session.snapshotId === sessionRef.current?.snapshotId) savedAnchor.current = anchor;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let ownedId: string | null = null;
    abortRef.current.abort(); abortRef.current = new AbortController();
    cache.current.clear(); inFlight.current.clear(); countsRef.current = {};
    setCover(true); setSnapshot(null); setLocation(null); setPageCounts({}); setBusy(true); setError(null); setStatus("unchanged");
    void (async () => {
      try {
        const result = await window.storyOSAgent.openBookReader(bookId);
        ownedId = result.snapshotId;
        if (!active) { await window.storyOSAgent.closeBookReader(result.snapshotId); return; }
        sessionRef.current = result; sequence.current = 0;
        const prefs = { ...(result.readingState?.preferences ?? DEFAULT_READER_PREFERENCES), mode: "three-dimensional" as const };
        preferencesRef.current = prefs; setPreferences(prefs);
        const anchor = result.readingState?.anchor ?? null;
        savedAnchor.current = anchor; positionAnchor.current = anchor; setCover(true); setSnapshot(result);
        const ordered = orderedReaderChapters(result);
        const targetId = ordered.find(c => c.id === anchor?.chapterId)?.id ?? ordered[0]?.id;
        if (targetId) {
          const measured = await loadChapter(targetId);
          if (!active) return;
          const restored = restoreReaderAnchor(measured, anchor);
          if (restored.relocated) setNotice("正文位置已变化，已为你定位到可阅读的位置。");
          setLocation({ chapter: measured, pageIndex: pageAtPosition(measured, restored.position) });
        }
      } catch (cause) { if (active) setError(message(cause)); }
      finally { if (active) setBusy(false); }
    })();
    return () => {
      active = false; generation.current++;
      abortRef.current.abort(); cache.current.clear(); inFlight.current.clear();
      if (ownedId) {
        const id = ownedId;
        // Normal navigation flushes explicitly. Unmount is a best effort for window close.
        void flush().catch((): void => undefined).finally(() => window.storyOSAgent.closeBookReader(id).catch((): void => undefined));
      }
      sessionRef.current = null;
    };
  }, [bookId, reload, loadChapter, flush, enabled]);

  useEffect(() => {
    if (!snapshot || busy) return;
    const timer = setTimeout(() => { void flush().catch(cause => setNotice(`阅读进度保存失败：${message(cause)}`)); }, 700);
    return () => clearTimeout(timer);
  }, [location, preferences, snapshot, busy, cover, flush]);

  // Index pages in small background jobs; no full-book body transfer or persistent Editor instances.
  useEffect(() => {
    if (!snapshot || busy) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const remaining = chapters.filter(c => countsRef.current[c.id] === undefined);
    const next = async () => {
      const chapter = remaining.shift();
      if (canceled || !chapter) return;
      try { await loadChapter(chapter.id); }
      catch { /* Foreground navigation reports chapter failures; a failed index is not complete. */ }
      if (!canceled) timer = setTimeout(() => void next(), 100);
    };
    timer = setTimeout(() => void next(), 400);
    return () => { canceled = true; clearTimeout(timer); };
  }, [snapshot, chapters, busy, preferences.fontSize, preferences.lineHeight, loadChapter]);

  const checkStatus = useCallback(async () => {
    const id = sessionRef.current?.snapshotId;
    if (!id) return;
    try { const next = await window.storyOSAgent.getBookReaderStatus(id); if (id === sessionRef.current?.snapshotId) setStatus(next); }
    catch (cause) { setNotice(message(cause)); }
  }, []);
  useEffect(() => {
    const check = () => { if (!document.hidden) void checkStatus(); };
    window.addEventListener("focus", check);
    const timer = setInterval(check, 30_000);
    return () => { window.removeEventListener("focus", check); clearInterval(timer); };
  }, [checkStatus]);

  const jump = useCallback(async (chapterId: string, fraction = 0) => {
    const token = ++generation.current; setBusy(true); setError(null);
    try {
      const measured = await loadChapter(chapterId);
      if (token !== generation.current) return;
      const offset = Math.floor(fraction * Math.max(0, measured.positions.length - 1));
      setLocation({ chapter: measured, pageIndex: pageAtPosition(measured, measured.positions[offset] ?? 1) }); setCover(false);
      void checkStatus();
    } catch (cause) { if (token === generation.current) setError(message(cause)); }
    finally { if (token === generation.current) setBusy(false); }
  }, [loadChapter, checkStatus]);

  const prepareMove = useCallback(async (direction: number, double: boolean): Promise<ReaderLocation | null> => {
    const current = locationRef.current;
    if (!current || status === "unavailable") return null;
    const index = double ? spreadStart(current.pageIndex) + direction * 2 : current.pageIndex + direction;
    if (index >= -1 && (index >= 0 || double) && index < current.chapter.pages.length) return { chapter: current.chapter, pageIndex: Math.max(0, index) };
    const chapterIndex = chapters.findIndex(c => c.id === current.chapter.chapterId) + direction;
    const chapter = chapters[chapterIndex];
    if (!chapter) return null;
    const measured = await loadChapter(chapter.id);
    return { chapter: measured, pageIndex: direction > 0 ? 0 : measured.pages.length - 1 };
  }, [chapters, loadChapter, status]);

  const updatePreferences = useCallback(async (next: ReaderPreferences, forceLayout = false) => {
    const previous = preferencesRef.current;
    preferencesRef.current = next; setPreferences(next);
    if (previous.fontSize === next.fontSize && previous.lineHeight === next.lineHeight && !forceLayout) return;
    const current = locationRef.current;
    if (!current) return;
    const anchor = positionAnchor.current ?? createReaderAnchor(current.chapter, current.chapter.pages[current.pageIndex].from);
    const token = ++generation.current; setBusy(true); setError(null);
    abortRef.current.abort(); abortRef.current = new AbortController();
    cache.current.clear(); inFlight.current.clear(); countsRef.current = {}; setPageCounts({});
    try {
      const measured = await loadChapter(current.chapter.chapterId);
      if (token === generation.current) setLocation({ chapter: measured, pageIndex: pageAtPosition(measured, restoreReaderAnchor(measured, anchor).position) });
    } catch (cause) { if (token === generation.current) setError(message(cause)); }
    finally { if (token === generation.current) setBusy(false); }
  }, [loadChapter]);

  useEffect(() => {
    if (sessionRef.current && locationRef.current) void updatePreferences(preferencesRef.current, true);
  }, [size.width, size.height, updatePreferences]);

  return { loadChapter, snapshot, chapters, location, preferences, cover, setCover, busy, error, notice, setNotice, status,
    pageCounts, jump, prepareMove, commit: (target: ReaderLocation) => { positionAnchor.current = createReaderAnchor(target.chapter, target.chapter.pages[target.pageIndex].from); setLocation(target); setCover(false); },
    updatePreferences, flush, refresh: async () => { await flush(); setReload(v => v + 1); },
    retry: () => setReload(v => v + 1) };
}


