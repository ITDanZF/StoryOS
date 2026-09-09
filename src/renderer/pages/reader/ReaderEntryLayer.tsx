import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BookCoverArtwork from "../../components/BookCoverArtwork.tsx";
import "./readerEntry.css";

type Entry = { id: number; bookId: string; title: string; rect: { x: number; y: number; width: number; height: number } | null };
let active: Entry | null = null, sequence = 0;
export function startReaderEntry(book: { bookId: string; title: string }, navigate: (path: string) => void) {
  if (active) return;
  const trigger = document.activeElement as HTMLElement;
  const area = trigger?.closest("article,section");
  const cover = area?.querySelector<HTMLElement>("[data-cover-art]");
  const rect = cover?.getBoundingClientRect();
  const entry: Entry = { id: ++sequence, bookId: book.bookId, title: book.title, rect: rect && rect.width > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
  active = entry; window.dispatchEvent(new CustomEvent("storyos:reader-enter", { detail: entry }));
  // Keep an already-painted transition above the lazy route, including its Suspense fallback.
  requestAnimationFrame(() => requestAnimationFrame(() => { if (active?.id === entry.id) navigate(`/bookshelf/${encodeURIComponent(book.bookId)}/read`); }));
}
export function finishReaderEntry(bookId: string, handoff = false): Promise<void> {
  return new Promise(resolve => window.dispatchEvent(new CustomEvent("storyos:reader-ready", { detail: { bookId, handoff, resolve } })));
}
export default function ReaderEntryLayer() {
  const [entry, setEntry] = useState<Entry | null>(null), [slow, setSlow] = useState(0);
  const layer = useRef<HTMLDivElement>(null), art = useRef<HTMLDivElement>(null);
  const flight = useRef<Animation | null>(null);
  const currentEntry = useRef<Entry | null>(null);
  const navigate = useNavigate(), location = useLocation();
  useEffect(() => {
    const enter = (event: Event) => { currentEntry.current = (event as CustomEvent<Entry>).detail; setEntry(currentEntry.current); setSlow(0); };
    const ready = async (event: Event) => {
      const { bookId, handoff, resolve } = (event as CustomEvent<{ bookId: string; handoff: boolean; resolve: () => void }>).detail;
      const id = currentEntry.current?.id;
      if (currentEntry.current?.bookId !== bookId) { resolve(); return; }
      if (handoff) {
        await flight.current?.finished.catch((): void => undefined);
        const source = art.current, target = document.querySelector(".reader-entry-cover")?.getBoundingClientRect();
        if (source && target && currentEntry.current?.id === id) {
          const bounds = source.getBoundingClientRect();
          const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
          const alignment = source.animate([{ transform: "none" }, { transform: `translate(${target.x - bounds.x}px,${target.y - bounds.y}px) scale(${target.width / bounds.width},${target.height / bounds.height})` }], { duration, fill: "forwards", easing: "ease-out" });
          layer.current?.animate([{ backgroundColor: "#141720" }, { backgroundColor: "transparent" }], { duration, fill: "forwards" });
          await alignment.finished.catch((): void => undefined);
        }
      }
      if (currentEntry.current?.id === id) { currentEntry.current = null; active = null; setEntry(null); }
      resolve();
    };
    window.addEventListener("storyos:reader-enter", enter); window.addEventListener("storyos:reader-ready", ready);
    return () => { window.removeEventListener("storyos:reader-enter", enter); window.removeEventListener("storyos:reader-ready", ready); };
  }, []);
  useEffect(() => {
    if (!entry || !art.current) return;
    const bounds = art.current.getBoundingClientRect(), from = entry.rect;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = art.current.animate(from && !reduced ? [
      { transform: `translate(${from.x - bounds.x}px,${from.y - bounds.y}px) scale(${from.width / bounds.width},${from.height / bounds.height})` },
      { transform: "translate(0,0) scale(1)" },
    ] : [{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 80 : 340, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
    flight.current = animation;
    const timer = setTimeout(() => setSlow(1), 2000), retryTimer = setTimeout(() => setSlow(2), 8000);
    return () => { animation.cancel(); clearTimeout(timer); clearTimeout(retryTimer); };
  }, [entry]);
  useEffect(() => {
    if (!entry) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { currentEntry.current = null; active = null; setEntry(null); navigate("/bookshelf"); } };
    window.addEventListener("keydown", cancel); return () => window.removeEventListener("keydown", cancel);
  }, [entry, navigate]);
  useEffect(() => { if (entry && !location.pathname.startsWith("/bookshelf")) { currentEntry.current = null; active = null; setEntry(null); } }, [location.pathname, entry]);
  if (!entry) return null;
  return <div ref={layer} className="reader-entry-layer" role="status" aria-label={`正在打开《${entry.title}》`}>
    <div className="reader-entry-art" ref={art}><BookCoverArtwork bookId={entry.bookId} title={entry.title} /></div>
    <p>{slow === 2 ? "准备时间较长，你可以继续等待或重新准备。" : "正在准备书页…"}</p>
    {slow > 0 && <div className="reader-entry-recovery">{slow === 2 && <button onClick={() => window.dispatchEvent(new Event("storyos:reader-retry"))}>重新准备</button>}<button onClick={() => { currentEntry.current = null; active = null; setEntry(null); navigate("/bookshelf"); }}>取消并返回书架</button></div>}
  </div>;
}
