import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { ReaderPreferences } from "../../../shared/book/reader.ts";
import type { ReaderLocation } from "./useBookReader.ts";
import type { PageSize } from "./bookPresentation.ts";
import { bookPageLayout } from "./bookPageLayout.ts";

/** Native selectable chapter flow; page boundaries remain navigation coordinates only. */
export default function PlainChapter({ location, size, preferences, onPosition }: {
  location: ReaderLocation; size: PageSize; preferences: ReaderPreferences; onPosition: (pageIndex: number) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null), reported = useRef(-1), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocks = useMemo(() => [...new Map(location.chapter.pages.flatMap(page => page.blocks).map(block => [block.top, block])).values()].sort((a, b) => a.top - b.top), [location.chapter]);
  const height = Math.max(1, ...blocks.map(block => block.top + block.height));
  useEffect(() => {
    if (reported.current !== location.pageIndex && scroll.current) scroll.current.scrollTop = location.chapter.pages[location.pageIndex].top;
    reported.current = location.pageIndex;
  }, [location.chapter, location.pageIndex]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div className="reader-book-dom reader-plain-scroll" ref={scroll} aria-label="可选择文字的连续章节" style={{ width: size.width, maxHeight: size.height,
    "--reader-content-width": `${bookPageLayout(size).width}px`, "--reader-font-size": `${preferences.fontSize}px`, "--reader-line-height": preferences.lineHeight } as CSSProperties}
    onScroll={() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const top = scroll.current?.scrollTop ?? 0;
        const pageIndex = Math.max(0, location.chapter.pages.findLastIndex(page => page.top <= top + 2));
        if (pageIndex !== reported.current) { reported.current = pageIndex; onPosition(pageIndex); }
      }, 100);
    }}>
    <div className="reader-document reader-plain-content" style={{ height }}>
      {blocks.map(block => <div className="reader-page-block" key={block.top} style={{ top: block.top }} dangerouslySetInnerHTML={{ __html: block.html }} />)}
      {!location.chapter.text.trim() && <p>本章还没有正文</p>}
    </div>
  </div>;
}
