import { readerThemeKey } from "./readerThemes.ts";
import { COVER_THEME_VERSION } from "../book-presentation/coverThemes.ts";
import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReaderPreferences } from "../../../shared/book/reader.ts";
import { blankLeaf, coverLeaf, type BookCursor, type BookSpread, type PageSize } from "./bookPresentation.ts";
import { pageStackCount } from "./scene/pageStackMotion.ts";
import PageContentLayer from "./PageContentLayer.tsx";
import PlainChapter from "./PlainChapter.tsx";
import { bookPageLayout } from "./bookPageLayout.ts";
import BookCoverArtwork from "../book-presentation/BookCoverArtwork.tsx";
import BookScene, { type RestingSheets, type SceneSheets, type PageMotion } from "./scene/BookScene.tsx";
import { PageTextureCache } from "./scene/pageTextureCache.ts";

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export type ReaderStageHandle = { turn: (direction: number) => void; go: (cursor: BookCursor) => void; cancel: () => void };
type Props = {
  bookId: string; title: string; synopsis: string; spread: BookSpread; size: PageSize; scale: number; double: boolean;
  preferences: ReaderPreferences; reduced: boolean; disabled: boolean; resumed: boolean; resumeCursor: BookCursor | null;
  prepare: (cursor: BookCursor) => Promise<BookSpread>; neighbor: (spread: BookSpread, direction: number) => BookCursor | null;
  onCommit: (spread: BookSpread) => void; onEntryReady: (handoff?: boolean) => Promise<void>; onReturn: () => void; onFailure: (message: string) => void; onNotice: (message: string) => void;
};
type Job = { id: number; target: BookSpread; kind: "open" | "turn" | "jump" | "replace" | "warm"; direction: number; keys: string[]; profile: string };
type View = { spread: BookSpread; sheets: RestingSheets; keys: string[] };
type Scene = { resting: RestingSheets | null; sheets: SceneSheets | null; revision: number; opening: boolean };
const defaultMotion = (): PageMotion => ({ progress: 0, target: 1, direction: 1, finished: true, velocity: 0, dragProgress: 0, grabY: 0 });

export default forwardRef<ReaderStageHandle, Props>(function ReaderStage(props, ref) {
  const latest = useRef(props); latest.current = props;
  const [phase, setPhase] = useState("entering"), phaseRef = useRef("entering");
  const changePhase = useCallback((value: string) => { phaseRef.current = value; setPhase(value); }, []);
  const [job, setJob] = useState<Job | null>(null), jobRef = useRef<Job | null>(null);
  const [view, setView] = useState<View | null>(null), viewRef = useRef<View | null>(null);
  const [scene, setScene] = useState<Scene>({ resting: null, sheets: null, revision: 0, opening: false });
  const capture = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const cache = useRef<PageTextureCache | null>(null), token = useRef(0), entered = useRef(false);
  const prepared = useRef<View | null>(null), queued = useRef<number | null>(null), pendingEffects = useRef(false);
  const [effects, setEffects] = useState(true);
  const motion = useRef(defaultMotion());
  const drag = useRef<{ id: number; x: number; lastX: number; time: number; direction: number; element: HTMLElement } | null>(null);
  const mode3d = props.preferences.mode === "three-dimensional";
  const requestedRasterScale = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio * props.scale * 1.35 * 2) / 2));
  // Four active surfaces must fit even when the book fills a large, high-DPI window.
  const maximumRasterScale = Math.sqrt(28 * 1024 * 1024 / (props.size.width * props.size.height * 4 * (1 + 4 / 3)));
  const rasterScale = Math.min(requestedRasterScale, Math.floor(maximumRasterScale * 4) / 4);
  const dpr = Math.min(window.devicePixelRatio, 2.5, Math.sqrt(8_000_000 / Math.max(1, window.innerWidth * window.innerHeight)));
  const surfaceKey = (leafId: string, side: number) => `${leafId}:${readerThemeKey(props.preferences.theme)}:${COVER_THEME_VERSION}:${props.preferences.fontSize}:${props.preferences.lineHeight}:${props.size.width}x${props.size.height}:${side}:${rasterScale}`;
  const keyRef = useRef(surfaceKey); keyRef.current = surfaceKey;
  const profile = `${props.size.width}:${props.size.height}:${props.scale}:${props.double}:${props.preferences.fontSize}:${props.preferences.lineHeight}:${readerThemeKey(props.preferences.theme)}:${COVER_THEME_VERSION}:${props.reduced}:${rasterScale}`;
  const profileRef = useRef(profile); profileRef.current = profile;

  const releaseDrag = () => {
    const current = drag.current; drag.current = null;
    if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
  };
  const cancel = useCallback(() => {
    token.current++; queued.current = null; jobRef.current = null; setJob(null); prepared.current = null;
    motion.current.finished = true; releaseDrag();
    setScene(previous => ({ ...previous, sheets: null, resting: viewRef.current?.sheets ?? null, opening: false }));
    changePhase(entered.current ? "reading" : "entering");
  }, [changePhase]);
  const commitView = useCallback((next: View) => {
    viewRef.current = next; setView(next); jobRef.current = null; setJob(null); prepared.current = null;
    setScene(previous => ({ ...previous, resting: next.sheets, sheets: null, opening: false }));
    entered.current = true; changePhase("reading");
    latest.current.onCommit(next.spread); latest.current.onEntryReady();
    if (pendingEffects.current) { setEffects(false); pendingEffects.current = false; }
  }, [changePhase]);
  const begin = useCallback((target: BookSpread, kind: Job["kind"], direction = 1, dragging = false) => {
    const current = latest.current;
    if (current.preferences.mode === "plain") {
      entered.current = true; changePhase("reading"); current.onCommit(target); current.onEntryReady();
      viewRef.current = null; setView(null); return;
    }
    const id = ++token.current;
    const leaves = kind === "open" ? [blankLeaf("inner-cover"), coverLeaf(current.title), ...target.leaves] : target.leaves;
    const keys = leaves.map((leaf, i) => keyRef.current(leaf.id, i % 2));
    const next = { id, target, kind, direction, keys, profile: profileRef.current }; jobRef.current = next; setJob(next);
    if (kind !== "warm") {
      motion.current = { ...defaultMotion(), speed: kind === "jump" ? 11 : 14, sheetCount: kind === "jump" ? pageStackCount((viewRef.current?.spread ?? current.spread).position, target.position, current.double) : 1, target: dragging && drag.current ? null : dragging ? motion.current.target ?? 0 : 1, finished: true, direction, grabY: motion.current.grabY,
        dragProgress: dragging ? motion.current.dragProgress : 0, velocity: dragging ? motion.current.velocity : 0 };
      changePhase(kind === "open" ? "entering" : "preparing");
    }
  }, [changePhase]);
  const turn = useCallback(async (direction: number, dragging = false) => {
    const current = latest.current;
    if (current.disabled || !entered.current) return;
    if (phaseRef.current !== "reading") { queued.current = direction; return; }
    const source = viewRef.current?.spread ?? current.spread, cursor = current.neighbor(source, direction);
    if (!cursor) return;
    const id = ++token.current; changePhase("preparing");
    try { const target = await current.prepare(cursor); if (id === token.current) begin(target, current.reduced || target.cursor.kind === "cover" ? "replace" : source.cursor.kind === "cover" ? "open" : "turn", direction, dragging); }
    catch (cause) { if (id === token.current) { changePhase("reading"); releaseDrag(); current.onNotice(String(cause)); } }
  }, [begin, changePhase]);
  const go = useCallback(async (cursor: BookCursor) => {
    cancel(); const id = ++token.current; changePhase("preparing");
    try {
      const current = latest.current, source = viewRef.current?.spread ?? current.spread;
      const target = await current.prepare(cursor);
      if (id !== token.current) return;
      if (current.reduced || current.preferences.mode === "plain" || target.cursor.kind === "cover" || source.key === target.key) { begin(target, "replace"); return; }
      if (source.cursor.kind === "cover") { begin(target, "open"); return; }
      const count = pageStackCount(source.position, target.position, current.double);
      begin(target, count > 1 ? "jump" : "turn", target.position > source.position ? 1 : -1);
    } catch (cause) { if (id === token.current) { changePhase("reading"); latest.current.onNotice(String(cause)); } }
  }, [begin, cancel, changePhase]);
  useImperativeHandle(ref, () => ({ turn: direction => { void turn(direction); }, go: cursor => { void go(cursor); }, cancel }), [turn, go, cancel]);

  useEffect(() => {
    if (!mode3d) { cancel(); cache.current?.dispose(); cache.current = null; begin(props.spread, "replace"); return; }
    if (jobRef.current && jobRef.current.kind !== "warm") {
      if (jobRef.current.profile === profile) return;
      cancel();
    }
    if (props.disabled) return;
    const keys = props.spread.leaves.map((leaf, i) => surfaceKey(leaf.id, i));
    if (viewRef.current && keys.every((key, i) => key === viewRef.current.keys[i])) return;
    begin(props.spread, !entered.current && !props.reduced && props.spread.cursor.kind !== "cover" ? "open" : "replace");
  }, [props.spread.key, props.preferences, props.size.width, props.size.height, props.scale, props.double, props.disabled, mode3d, props.reduced, phase, profile, begin, cancel]);

  useEffect(() => {
    if (!job || !capture.current) return;
    let alive = true; const store = cache.current ?? (cache.current = new PageTextureCache());
    store.pin([...(viewRef.current?.keys ?? []), ...job.keys]);
    const elements = Array.from(capture.current.querySelectorAll<HTMLElement>(".reader-sheet"));
    void (async () => {
      await document.fonts.ready;
      const textures = [];
      for (let i = 0; i < elements.length; i++) { if (!alive) return; textures.push(await store.get(job.keys[i], elements[i], rasterScale)); }
      if (!alive || token.current !== job.id) return;
      if (job.kind === "warm") { jobRef.current = null; setJob(null); return; }
      const offset = job.kind === "open" ? 2 : 0;
      prepared.current = { spread: job.target, sheets: { left: textures[offset], right: textures[offset + 1] }, keys: job.keys.slice(offset) };
      const source = job.kind === "open" ? { left: textures[0], right: textures[1] } : viewRef.current?.sheets;
      const target = prepared.current.sheets;
      const sheets = source && job.kind !== "replace" ? job.direction > 0 ? { left: source.left, right: target.right, front: source.right, back: target.left } : { left: target.left, right: source.right, front: target.right, back: source.left } : null;
      setScene({ resting: sheets ? source : target, sheets, revision: job.id, opening: job.kind === "open" });
    })().catch(cause => { if (alive && job.kind !== "warm") { cancel(); latest.current.onFailure(`三维书页准备失败：${cause instanceof Error ? cause.message : String(cause)}`); } });
    return () => { alive = false; };
  }, [job, rasterScale, cancel]);

  const settled = useCallback((committed: boolean) => {
    const next = prepared.current, queuedDirection = queued.current; queued.current = null;
    if (committed && next) commitView(next); else cancel();
    if (queuedDirection !== null) queueMicrotask(() => { void turn(queuedDirection); });
  }, [commitView, cancel, turn]);
  const gpuReady = useCallback(async (revision: number) => {
    if (revision !== token.current || !prepared.current) return;
    const active = jobRef.current;
    if (!active) return;
    if (active.kind === "replace") { commitView(prepared.current); return; }
    if (active.kind === "open") await latest.current.onEntryReady(true);
    if (revision !== token.current) return;
    changePhase(active.kind === "open" ? "opening" : "turning"); motion.current.finished = false;
  }, [commitView, changePhase]);
  const failure = useCallback(() => { cancel(); latest.current.onFailure("三维图形不可用，已保留阅读位置并切换文本模式。"); }, [cancel]);
  const slow = useCallback(() => {
    if (effects) { pendingEffects.current = true; latest.current.onNotice("下次翻页将减少光影效果，文字清晰度保持不变。"); }
  }, [effects]);
  useEffect(() => {
    if (phase !== "reading" || !mode3d || props.disabled || jobRef.current || !viewRef.current) return;
    let alive = true;
    const timer = setTimeout(() => {
      const cursor = latest.current.neighbor(viewRef.current.spread, 1);
      if (cursor) void latest.current.prepare(cursor).then(target => { if (alive && phaseRef.current === "reading" && !jobRef.current) begin(target, "warm"); }).catch((): void => undefined);
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [phase, view, mode3d, props.disabled, begin]);
  useEffect(() => {
    const blur = () => { if (entered.current && ["turning", "preparing"].includes(phaseRef.current)) cancel(); };
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("blur", blur); token.current++; jobRef.current = null; prepared.current = null; releaseDrag(); cache.current?.dispose(); cache.current = null; };
  }, [cancel]);

  const display = mode3d ? view?.spread ?? props.spread : props.spread;
  const captureLeaves = job ? job.kind === "open" ? [blankLeaf("inner-cover"), coverLeaf(props.title), ...job.target.leaves] : job.target.leaves : [];
  const busy = phase !== "reading" || props.disabled;
  const closed = display.cursor.kind === "cover";
  const displayDouble = props.double && !closed;
  const visualWidth = (displayDouble ? 2 : 1) * props.size.width * props.scale;
  return <div ref={stage} className="reader-stage" data-phase={phase} data-turning={phase === "turning"} data-jump={job?.kind === "jump"} data-jump-sheets={job?.kind === "jump" ? motion.current.sheetCount : undefined} data-jump-direction={job?.kind === "jump" ? job.direction : undefined} data-renderer={mode3d ? "webgl" : "dom"} data-page-key={display.key} data-page-kind={display.cursor.kind} aria-label="阅读舞台" tabIndex={0}
    onKeyDown={event => { if ((event.target as HTMLElement).closest("button,input,select,textarea")) return; if (["ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(event.key)) { event.preventDefault(); void turn(["ArrowLeft", "PageUp"].includes(event.key) ? -1 : 1); } }}>
    <div className="reader-stage-visual">
      {mode3d && <SceneBoundary key={props.preferences.mode} onFailure={failure}><BookScene size={props.size} scale={props.scale} double={props.double} cover={!entered.current || closed} dark={props.preferences.theme === "dark"}
        resting={scene.resting} sheets={scene.sheets} revision={scene.revision} opening={scene.opening} effects={effects} dpr={dpr} motion={motion} onReady={gpuReady} onSettled={settled} onFailure={failure} onSlow={slow} /></SceneBoundary>}
      {!mode3d && display.location && <PlainChapter location={display.location} size={props.size} preferences={props.preferences} onPosition={pageIndex => {
        const id = ++token.current;
        void latest.current.prepare({ kind: "chapter", chapterId: display.location.chapter.chapterId, pageIndex }).then(next => {
          if (id === token.current) latest.current.onCommit({ ...next, location: { chapter: display.location.chapter, pageIndex } });
        }).catch(cause => latest.current.onNotice(String(cause)));
      }} />}
      {!mode3d && !display.location && <div className="reader-book-dom" style={{ width: visualWidth, height: props.size.height * props.scale }}><div className="reader-book-pages" style={{ transform: `scale(${props.scale})`, width: props.size.width * (displayDouble ? 2 : 1) }}>
        {display.leaves.map((leaf, i) => (displayDouble || i === 1) && <PageContentLayer key={i} leaf={leaf} bookId={props.bookId} bookTitle={props.title} synopsis={props.synopsis} preferences={props.preferences} size={props.size} side={i ? "right" : "left"} />)}
      </div></div>}
      {phase === "entering" && <div className="reader-entry-cover" style={{ width: props.size.width * props.scale, height: props.size.height * props.scale }}><BookCoverArtwork bookId={props.bookId} title={props.title} />{props.resumed && <span className="reader-resume-ribbon">接着上次阅读</span>}</div>}
      {<div className="reader-page-hotspots" style={{ width: visualWidth, height: props.size.height * props.scale }}>
        {mode3d && [-1, 1].map(direction => <div key={direction} className={`reader-drag-edge ${direction < 0 ? "left" : "right"}`} aria-hidden="true" onPointerDown={event => {
          if (event.button !== 0 || closed || busy || props.reduced || !props.neighbor(display, direction)) return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          const bounds = event.currentTarget.getBoundingClientRect(); motion.current = defaultMotion(); motion.current.target = null; motion.current.grabY = ((event.clientY - bounds.top) / bounds.height - .5) * 2;
          drag.current = { id: event.pointerId, x: event.clientX, lastX: event.clientX, time: performance.now(), direction, element: event.currentTarget }; void turn(direction, true);
        }} onPointerMove={event => {
          const current = drag.current; if (!current) return;
          const now = performance.now(), distance = props.size.width * props.scale;
          motion.current.dragProgress = Math.max(0, Math.min(.98, (current.x - event.clientX) * direction / distance));
          motion.current.velocity = Math.max(-3, Math.min(3, (current.lastX - event.clientX) * direction / (distance * Math.max(.008, (now - current.time) / 1000))));
          current.lastX = event.clientX; current.time = now;
        }} onPointerUp={() => {
          if (!drag.current) return; if (performance.now() - drag.current.time > 100) motion.current.velocity = 0;
          motion.current.target = motion.current.dragProgress + motion.current.velocity * .06 > .3 ? 1 : 0; releaseDrag();
        }} onPointerCancel={cancel} />)}
        {!busy && closed && <div className="reader-cover-actions"><button onClick={() => void turn(1)}>打开书籍</button>{props.resumeCursor && <button onClick={() => void go(props.resumeCursor)}>继续阅读</button>}</div>}
        {!busy && display.leaves.map((leaf, side) => (props.double || side === 1) && leaf.kind === "toc" && <div className="reader-toc-hotspots" key={side} style={{ left: props.double ? side * props.size.width * props.scale : 0, width: props.size.width, transform: `scale(${props.scale})` }}>
          {leaf.tocRows.flatMap(row => row.kind === "chapter" ? [<button key={row.entry.chapterId} style={{ position: "absolute", top: row.top, height: row.height, left: side === 0 ? bookPageLayout(props.size).outer : bookPageLayout(props.size).inner, width: bookPageLayout(props.size).width }} aria-label={`阅读${row.entry.title}`} onClick={() => void go({ kind: "chapter", chapterId: row.entry.chapterId, pageIndex: 0 })} />] : [])}
        </div>)}
        {!busy && display.leaves.some(leaf => leaf.kind === "end") && <div className="reader-end-actions" style={{ left: props.double ? display.leaves.findIndex(leaf => leaf.kind === "end") * visualWidth / 2 : 0, width: visualWidth / (props.double ? 2 : 1) }}><button onClick={() => void go({ kind: "front", pageIndex: 1 })}>回到目录</button><button onClick={props.onReturn}>返回书架</button></div>}
      </div>}
    </div>
    <div className="reader-stage-actions"><button aria-label="上一页" disabled={busy || !props.neighbor(display, -1)} onClick={() => void turn(-1)}><ChevronLeft size={21} /></button><button aria-label="下一页" disabled={busy || !props.neighbor(display, 1)} onClick={() => void turn(1)}><ChevronRight size={21} /></button></div>
    {mode3d && <div className="reader-accessible-pages">{display.leaves.filter((_, i) => displayDouble || i === 1).map(leaf => <section key={leaf.id} aria-label={leaf.label}>{leaf.page?.text ?? leaf.title}</section>)}</div>}
    {phase === "entering" && <span className="reader-preparing" role="status">{props.resumed ? "正在准备上次读到的书页…" : "正在准备书页…"}</span>}
    {phase === "preparing" && <span className="reader-preparing" role="status">正在准备目标书页…</span>}
    {job && createPortal(<div ref={capture} className="reader-capture" aria-hidden="true">{captureLeaves.map((leaf, i) => <PageContentLayer key={i} leaf={leaf} bookId={props.bookId} bookTitle={props.title} synopsis={props.synopsis} preferences={props.preferences} size={props.size} side={i % 2 ? "right" : "left"} textureKey={job.keys[i]} />)}</div>, document.body)}
  </div>;
});


