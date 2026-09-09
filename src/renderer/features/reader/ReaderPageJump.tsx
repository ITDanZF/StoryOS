import { useState } from "react";
import type { BookCursor, TocEntry } from "./bookPresentation.ts";

export default function ReaderPageJump({ total, entries, disabled, onGo }: { total: number | null; entries: TocEntry[]; disabled: boolean; onGo: (cursor: BookCursor) => void }) {
  const [value, setValue] = useState(""), [error, setError] = useState("");
  return <form className="reader-chapter-jump" onSubmit={event => {
    event.preventDefault(); const folio = Number(value);
    if (!Number.isInteger(folio) || total === null || folio < 1 || folio > total) { setError(`请输入 1–${total} 之间的页码`); return; }
    const chapter = [...entries].reverse().find(entry => entry.folio !== null && (entry.volumeFolio ?? entry.folio) <= folio);
    if (!chapter) return;
    const volume = chapter.volumeFolio !== null && folio < chapter.folio;
    setError(""); setValue(""); onGo({ kind: volume ? "volume" : "chapter", chapterId: chapter.chapterId, pageIndex: folio - (volume ? chapter.volumeFolio : chapter.folio) });
  }}>
    <label htmlFor="reader-folio-input">{total === null ? "正文页码计算中" : `正文共 ${total} 页`}</label>
    <div><input id="reader-folio-input" aria-label="跳转正文页码" placeholder="输入页码" inputMode="numeric" value={value} disabled={disabled || !total} onChange={event => setValue(event.target.value)} /><button disabled={disabled || !total}>前往</button></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
