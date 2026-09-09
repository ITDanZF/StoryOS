import { ArrowLeft, Book, BookOpen, List, PanelLeft, Maximize, Minimize, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ReaderPreferences } from "../../../shared/book/reader.ts";
import ReaderStage, { type ReaderStageHandle } from "./ReaderStage.tsx";
import ReaderSelect from "./ReaderSelect.tsx";
import ReaderPageJump from "./ReaderPageJump.tsx";
import useBookReader from "./useBookReader.ts";
import useReaderPresentation from "./useReaderPresentation.ts";
import { DEFAULT_PAGE_SIZE, type BookCursor, type PageSize } from "./bookPresentation.ts";
import { finishReaderEntry } from "./ReaderEntryLayer.tsx";
import BookCoverArtwork from "../book-presentation/BookCoverArtwork.tsx";
import "./reader.css";
import "./readerExperience.css";

export default function BookReaderPage() {
  const { bookId = "" } = useParams(), navigate = useNavigate();
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 700 });
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [layoutReady, setLayoutReady] = useState(false);
  const measuredViewport = useRef(false);
  const reader = useBookReader(bookId, pageSize, layoutReady), prefs = reader.preferences;
  const [toc, setToc] = useState(false), [filter, setFilter] = useState(""), [collapsed, setCollapsed] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1), [fullscreen, setFullscreen] = useState(false), [entered, setEntered] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [leaving, setLeaving] = useState(false), [leaveFailed, setLeaveFailed] = useState(false), [openingSlow, setOpeningSlow] = useState(false);
  const [openingVerySlow, setOpeningVerySlow] = useState(false);
  const stage = useRef<ReaderStageHandle>(null), viewport = useRef<HTMLDivElement>(null), returnButton = useRef<HTMLButtonElement>(null);
  const double = prefs.spread !== "single" && viewportSize.width >= 1100 && viewportSize.height >= 540;
  const presentation = useReaderPresentation(reader, pageSize, double);
  const { spread } = presentation;
  const visibleSpread = presentation.committed ?? spread;
  const disabled = reader.busy || reader.status === "unavailable" || !entered || leaving;
  useEffect(() => {
    if (!viewport.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const el = viewport.current;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer); timer = setTimeout(() => { measuredViewport.current = true; setViewportSize({ width: el.clientWidth, height: el.clientHeight }); }, 100);
    }); observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const height = Math.max(320, Math.floor(Math.min(1120, (viewportSize.height - 56) / zoom, (viewportSize.width - 88) / (double ? 2 : 1) / .72 / zoom)));
    const width = Math.round(height * .72);
    setPageSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    if (measuredViewport.current) setLayoutReady(true);
  }, [viewportSize, double, zoom]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)"), change = () => setReduced(query.matches);
    query.addEventListener("change", change); return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => { const change = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", change); return () => document.removeEventListener("fullscreenchange", change); }, []);
  useEffect(() => { const timer = setTimeout(() => setOpeningSlow(true), 2000); return () => clearTimeout(timer); }, []);
  useEffect(() => { const timer = setTimeout(() => setOpeningVerySlow(true), 8000); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    const retry = () => { stage.current?.cancel(); reader.retry(); };
    window.addEventListener("storyos:reader-retry", retry); return () => window.removeEventListener("storyos:reader-retry", retry);
  }, [reader.retry]);
  const entryReady = useCallback((handoff = false) => finishReaderEntry(bookId, handoff), [bookId]);
  useEffect(() => { if (reader.error || presentation.error) entryReady(); }, [reader.error, presentation.error, entryReady]);
  const fallback = useCallback((reason: string) => { reader.setNotice(reason); void reader.updatePreferences({ ...prefs, mode: "plain" }); entryReady(); }, [reader.setNotice, reader.updatePreferences, prefs, entryReady]);
  const go = (cursor: BookCursor) => { stage.current?.go(cursor); setToc(false); };
  const settings = (change: Partial<ReaderPreferences>) => { stage.current?.cancel(); void reader.updatePreferences({ ...prefs, ...change }); };
  const returnToShelf = async (ignoreSave = false) => {
    setLeaving(true); stage.current?.cancel(); entryReady();
    try {
      await Promise.all([ignoreSave ? Promise.resolve() : reader.flush(), new Promise(resolve => setTimeout(resolve, reduced ? 0 : 200))]);
      if (document.fullscreenElement) await document.exitFullscreen();
      navigate("/bookshelf", { state: { restoreReaderEntry: true } });
    } catch (cause) { setLeaveFailed(true); reader.setNotice(`阅读进度未保存：${String(cause)}`); setLeaving(false); }
  };
  const current = visibleSpread?.location;
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof presentation.index.entries>();
    for (const entry of presentation.index.entries) if (!filter || entry.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) groups.set(entry.volumeTitle, [...(groups.get(entry.volumeTitle) ?? []), entry]);
    return [...groups];
  }, [presentation.index.entries, filter]);
  useEffect(() => { if (toc) requestAnimationFrame(() => document.querySelector(".reader-toc button[aria-current=page]")?.scrollIntoView({ block: "nearest" })); }, [toc]);
  return <section className={`reader-shell ${prefs.theme === "dark" ? "reader-dark" : ""}`} data-exiting={leaving} data-entered={entered} aria-label="书籍阅读器" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") { event.preventDefault(); setToc(value => !value); }
    if (event.key !== "Escape") return;
    const panel = event.currentTarget.querySelector<HTMLDetailsElement>(".reader-settings[open]");
    if (panel) { panel.open = false; event.preventDefault(); }
    else if (toc) { setToc(false); event.preventDefault(); }
    else if (!entered) void returnToShelf();
  }}>
    <header className="reader-toolbar"><button ref={returnButton} aria-label="返回书架" onClick={() => void returnToShelf()} disabled={leaving} className="reader-back"><ArrowLeft size={18} /><span>返回书架</span></button>
      <div className="reader-toolbar-title"><small>STORYOS · READING ROOM</small><h1>{reader.snapshot?.book.title ?? "正在打开书籍…"}</h1></div>
      <div className="reader-tools"><button aria-label="回到封面" disabled={disabled} onClick={() => go({ kind: "cover", pageIndex: 0 })}><Book size={18} /><span>封面</span></button><button aria-label="目录" disabled={disabled} onClick={() => go({ kind: "front", pageIndex: 1 })}><List size={18} /><span>目录</span></button>
        <button aria-label="章节导航" title="章节导航 · Ctrl+J" aria-expanded={toc} onClick={() => setToc(value => !value)}><PanelLeft size={18} /></button>
        <button aria-label={prefs.mode === "plain" ? "3D 阅读" : "文本模式 · 选择文字"} onClick={() => settings({ mode: prefs.mode === "plain" ? "three-dimensional" : "plain" })}><BookOpen size={18} /><span>{prefs.mode === "plain" ? "3D 阅读" : "文本模式"}</span></button>
        <details className="reader-settings"><summary aria-label="阅读设置"><Settings2 size={18} /><span>阅读设置</span></summary><div className="reader-settings-panel">
          <label>字号<ReaderSelect label="阅读字号" value={String(prefs.fontSize)} options={[16,18,20,22,24,26].map(value => ({ value: String(value), label: String(value) }))} onChange={value => settings({ fontSize: Number(value) })} /></label>
          <label>行距<ReaderSelect label="阅读行距" value={String(prefs.lineHeight)} options={[1.6,1.8,2].map(value => ({ value: String(value), label: String(value) }))} onChange={value => settings({ lineHeight: Number(value) })} /></label>
          <label>页面<ReaderSelect label="页面布局" value={prefs.spread} options={[{ value: "auto", label: "自动" }, { value: "single", label: "单页" }, { value: "double", label: "双页" }]} onChange={value => settings({ spread: value as ReaderPreferences["spread"] })} /></label>
          <label>纸面<ReaderSelect label="阅读主题" value={prefs.theme} options={[{ value: "paper", label: "暖白纸张" }, { value: "dark", label: "夜间阅读" }]} onChange={value => settings({ theme: value as ReaderPreferences["theme"] })} /></label>
          <label>显示缩放<ReaderSelect label="显示缩放" value={String(zoom)} options={[{ value: "0.9", label: "90%" }, { value: "1", label: "100%" }, { value: "1.15", label: "115%" }]} onChange={value => { stage.current?.cancel(); setZoom(Number(value)); }} /></label>
        </div></details>
        <button aria-label={fullscreen ? "退出全屏" : "全屏阅读"} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => reader.setNotice("当前窗口无法进入全屏。"))}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
      </div>
    </header>
    {reader.status !== "unchanged" && <div className="reader-notice" role="status"><span>{reader.status === "changed" ? "正文已更新，当前显示打开时的版本。" : "书籍已不可用，请返回书架。"}</span>{reader.status === "changed" && <button onClick={() => { stage.current?.cancel(); void reader.refresh().catch(cause => reader.setNotice(String(cause))); }}>刷新正文</button>}</div>}
    {reader.notice && <div className="reader-notice" role="status"><span>{reader.notice}</span>{leaveFailed && <button onClick={() => void returnToShelf(true)}>仍然返回</button>}<button aria-label="关闭阅读提示" onClick={() => reader.setNotice(null)}><X size={16} /></button></div>}
    <div className="reader-body">
      {toc && <aside className="reader-toc" aria-label="章节目录"><div className="reader-toc-heading"><strong>目录</strong><button aria-label="关闭目录" onClick={() => setToc(false)}><X size={18} /></button></div>
        <button disabled={disabled} onClick={() => go({ kind: "cover", pageIndex: 0 })}>封面</button><button onClick={() => go({ kind: "front", pageIndex: 0 })}>扉页</button><button onClick={() => go({ kind: "front", pageIndex: 1 })}>书内完整目录</button>
        <ReaderPageJump total={presentation.index.total} entries={presentation.index.entries} disabled={disabled} onGo={go} />
        <input className="reader-toc-search" aria-label="搜索章节" placeholder="搜索章节" value={filter} onChange={event => setFilter(event.target.value)} />
        {grouped.map(([volume, entries]) => <div key={volume}><button className="reader-volume-toggle" aria-expanded={!collapsed.includes(volume)} onClick={() => setCollapsed(value => value.includes(volume) ? value.filter(item => item !== volume) : [...value, volume])}>{volume}<span>{collapsed.includes(volume) ? "+" : "−"}</span></button>
          {(!collapsed.includes(volume) || filter) && entries.map(entry => <button key={entry.chapterId} aria-current={entry.chapterId === current?.chapter.chapterId ? "page" : undefined} className={entry.chapterId === current?.chapter.chapterId ? "active" : ""} disabled={disabled}
            onClick={() => go({ kind: "chapter", chapterId: entry.chapterId, pageIndex: 0 })}><span>{entry.title}</span><small>{entry.folio === null ? "计算中" : `${entry.folio} 页`}</small></button>)}</div>)}
        {grouped.length === 0 && <p>{filter ? "没有匹配的章节" : "还没有章节"}</p>}
      </aside>}
      <div className="reader-viewport" ref={viewport}>
        {reader.error || presentation.error ? <div className="reader-error" role="alert"><h2>暂时无法阅读</h2><p>{reader.error ?? presentation.error}</p><button onClick={reader.retry}>重新打开</button><button onClick={() => void returnToShelf()}>返回书架</button></div> : spread && reader.snapshot ?
          <ReaderStage ref={stage} bookId={bookId} title={reader.snapshot.book.title} synopsis={reader.snapshot.book.synopsis ?? ""} spread={spread} size={pageSize} scale={zoom} double={double} preferences={prefs} reduced={reduced} disabled={reader.busy || leaving || reader.status === "unavailable"} resumed={Boolean(reader.snapshot.readingState?.anchor)}
            resumeCursor={reader.location ? { kind: "chapter", chapterId: reader.location.chapter.chapterId, pageIndex: reader.location.pageIndex } : null} prepare={presentation.prepare} neighbor={presentation.neighbor} onCommit={next => { presentation.commit(next); if (!entered) { setEntered(true); requestAnimationFrame(() => document.querySelector<HTMLElement>(".reader-stage")?.focus({ preventScroll: true })); } }} onEntryReady={entryReady} onReturn={() => void returnToShelf()} onFailure={fallback} onNotice={reader.setNotice} /> :
          <div className="reader-loading" role="status">{reader.snapshot && <div className="reader-loading-art"><BookCoverArtwork bookId={bookId} title={reader.snapshot.book.title} /></div>}<p>{openingVerySlow ? "准备时间较长，可以继续等待或重新打开。" : "正在准备书页…"}</p>{openingVerySlow && <button onClick={reader.retry}>重新准备</button>}{openingSlow && <button onClick={() => void returnToShelf()}>取消并返回书架</button>}</div>}
        {reader.busy && entered && <span className="reader-relayout-status" role="status">正在调整排版，保留当前书页…</span>}
      </div>
    </div>
  </section>;
}
