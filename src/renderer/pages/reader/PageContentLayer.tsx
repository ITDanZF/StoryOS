import type { CSSProperties } from "react";
import type { ReaderPreferences } from "../../../shared/book/reader.ts";
import type { BookLeaf, PageSize } from "./bookPresentation.ts";
import BookCoverArtwork from "../../components/BookCoverArtwork.tsx";
import { bookHeading } from "./bookHeading.ts";
import { bookPageLayout } from "./bookPageLayout.ts";

export default function PageContentLayer({ leaf, bookId, bookTitle, synopsis, preferences, size, side, textureKey }: {
  leaf: BookLeaf; bookId: string; bookTitle: string; synopsis: string; preferences: ReaderPreferences;
  size: PageSize; side: "left" | "right"; textureKey?: string;
}) {
  const { page } = leaf;
  const layout = bookPageLayout(size), chapterStart = page?.index === 0;
  const contentTop = layout.top + (chapterStart ? layout.chapterHeading : 0);
  const style = {
    "--reader-font-size": `${preferences.fontSize}px`, "--reader-line-height": preferences.lineHeight,
    "--reader-paper": preferences.theme === "dark" ? "#272b34" : "#f5f1e9",
    "--reader-ink": preferences.theme === "dark" ? "#dedbd5" : "#302c28",
    "--reader-page-top": `${layout.top}px`, "--reader-running-top": `${layout.runningTop}px`, "--reader-folio-bottom": `${layout.folioBottom}px`,
    "--reader-content-width": `${layout.width}px`, "--reader-page-left": `${side === "left" ? layout.outer : layout.inner}px`,
    "--reader-page-right": `${side === "left" ? layout.inner : layout.outer}px`, width: size.width, minWidth: size.width, height: size.height,
  } as CSSProperties;
  return <article className="reader-sheet" data-kind={leaf.kind} data-side={side} data-theme={preferences.theme} data-compact={size.height < 500} data-texture-key={textureKey} style={style} aria-label={leaf.label}>
    {leaf.kind === "cover" || leaf.kind === "back" ? <BookCoverArtwork bookId={bookId} title={bookTitle} /> : <>
      <header className="reader-running-title">{leaf.kind === "content" && !chapterStart ? side === "left" ? bookTitle : leaf.title : ""}</header>
      {chapterStart && <h2 className="reader-chapter-heading">{leaf.title}</h2>}
      {leaf.kind === "title" && <div className="reader-frontispiece"><span className="reader-frontispiece-kicker">STORYOS · 私人藏书</span><div className="reader-frontispiece-orbit"><span /></div><h2>{bookTitle}</h2><span className="reader-frontispiece-rule" /><p>{synopsis}</p></div>}
      {leaf.kind === "volume" && <div className="reader-frontispiece"><span className="reader-frontispiece-kicker">{bookTitle}</span><div className="reader-frontispiece-orbit"><span /></div><h2>{leaf.title}</h2><span className="reader-frontispiece-rule" /></div>}
      {leaf.kind === "toc" && <div className="reader-printed-toc">
        <div className="reader-contents-heading"><div><h2>目录</h2><span>CONTENTS</span></div><i aria-hidden="true" /><p>{bookTitle}</p></div>
        {leaf.tocRows.map((row, i) => {
          const heading = bookHeading(row.kind === "volume" ? row.title : row.entry.title);
          return row.kind === "volume" ? <h3 className="reader-printed-volume" key={i} style={{ top: row.top, height: row.height }}>{heading.number && <span>{heading.number}</span>}<strong>{heading.title}</strong></h3> :
            <div className="reader-printed-toc-row" key={i} style={{ top: row.top, height: row.height }}>
              <div className="reader-toc-chapter-title">{heading.number && <span>{heading.number}</span>}<strong>{heading.title}</strong></div>
              <span className="reader-toc-leader" /><span className="reader-toc-number">{row.entry.folio ?? "—"}</span>
            </div>;
        })}
        {leaf.entries.length === 0 && <p className="reader-contents-empty" style={{ top: layout.tocTop }}>还没有章节</p>}
      </div>}
      {leaf.kind === "end" && <div className="reader-frontispiece"><span className="reader-frontispiece-kicker">STORYOS · READING ROOM</span><div className="reader-frontispiece-orbit"><span /></div><h2>{leaf.title}</h2><span className="reader-frontispiece-rule" /><p>故事在这里停笔，也可以从另一页重新开始。</p></div>}
      {page && !page.text.trim() && <div className="reader-empty-page">本章还没有正文</div>}
      {page && <p className="reader-semantic-text">{page.text}</p>}
      {page && <div className="reader-page-clip reader-document" aria-hidden="true" style={{ top: contentTop, height: Math.max(0, page.height), maxHeight: size.height - contentTop - layout.bottom }}>
        {page.blocks.map((block, index) => <div key={index} className="reader-page-block" style={{ top: block.top - page.top }} dangerouslySetInnerHTML={{ __html: block.html }} />)}
      </div>}
      <footer className="reader-folio">{leaf.kind === "toc" ? leaf.label : leaf.kind === "content" ? leaf.folio ?? `本章 ${page.index + 1}` : ""}</footer>
      <div className="reader-paper-gutter" aria-hidden="true" />
    </>}
  </article>;
}
