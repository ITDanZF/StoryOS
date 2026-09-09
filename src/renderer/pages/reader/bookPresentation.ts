import type { ReaderChapter, ReaderManifest } from "../../../shared/book/reader.ts";
import type { ReaderLocation } from "./useBookReader.ts";
import type { ReaderPage } from "./readerModel.ts";
import { bookHeading } from "./bookHeading.ts";
import { bookPageLayout } from "./bookPageLayout.ts";

export type PageSize = { width: number; height: number };
export const DEFAULT_PAGE_SIZE: PageSize = { width: 480, height: 640 };
export type BookCursor = { kind: "cover"; pageIndex: number } | { kind: "chapter"; chapterId: string; pageIndex: number } | { kind: "volume"; chapterId: string; pageIndex: number } | { kind: "front"; pageIndex: number } | { kind: "end"; pageIndex: number } | { kind: "back"; pageIndex: number };
export type TocEntry = { chapterId: string; title: string; volumeTitle: string; volumeStart: boolean; volumeFolio: number | null; folio: number | null; empty: boolean };
export type PrintedTocRow = { kind: "volume"; title: string; top: number; height: number } | { kind: "chapter"; entry: TocEntry; top: number; height: number };
export type BookLeaf = {
  id: string; kind: "cover" | "back" | "title" | "volume" | "toc" | "content" | "blank" | "end";
  title: string; page: ReaderPage | null; folio: number | null; label: string;
  cursor?: BookCursor; entries?: TocEntry[]; tocRows?: PrintedTocRow[]; location?: ReaderLocation;
};
export type BookSpread = { position: number; key: string; cursor: BookCursor; leaves: [BookLeaf, BookLeaf]; location: ReaderLocation | null; previous: BookCursor | null; next: BookCursor | null };
export const blankLeaf = (id = "blank"): BookLeaf => ({ id, kind: "blank", title: "", page: null, folio: null, label: "留白页" });
export const coverLeaf = (title: string): BookLeaf => ({ ...blankLeaf("cover"), kind: "cover", title, label: "书籍封面" });

/** Chapters follow one continuous folio sequence; no recto-only chapter padding. */
export function createBookIndex(manifest: ReaderManifest, chapters: ReaderChapter[], counts: Record<string, number>) {
  let prefix: number | null = 0;
  const entries = chapters.map((chapter, i) => {
    const volume = manifest.volumes.find(v => v.id === chapter.volumeId);
    const volumeStart = Boolean(volume && (i === 0 || chapters[i - 1].volumeId !== chapter.volumeId));
    const volumeFolio = volumeStart && prefix !== null ? prefix + 1 : null;
    if (prefix !== null && volumeStart) prefix += 2;
    const folio = prefix === null ? null : prefix + 1, count = counts[chapter.id];
    prefix = prefix === null || count === undefined ? null : prefix + Math.max(1, count);
    return { chapterId: chapter.id, title: chapter.title, volumeTitle: volume?.title ?? "未分卷", volumeStart, volumeFolio, folio, empty: chapter.characterCount === 0 };
  });
  return { entries, total: prefix };
}

export function frontLeaves(title: string, entries: TocEntry[], size: PageSize): BookLeaf[] {
  const layout = bookPageLayout(size), bottom = size.height - layout.tocBottom;
  const tocPages: PrintedTocRow[][] = [[]];
  let top = layout.tocTop, lastVolume = "";
  for (const entry of entries) {
    const titleUnits = Array.from(bookHeading(entry.title).title).reduce((sum, character) => sum + (character.codePointAt(0) > 127 ? 1 : .6), 0);
    const rowHeight = layout.tocRowHeight + (size.height >= 500 && titleUnits * 20 > layout.width - 70 ? 26 : 0);
    const hasVolume = entry.volumeTitle !== "未分卷";
    let heading = hasVolume && lastVolume !== entry.volumeTitle;
    if (top + rowHeight + (heading ? layout.tocVolumeHeight : 0) > bottom && tocPages.at(-1).length) {
      tocPages.push([]); top = layout.tocTop; heading = hasVolume;
    }
    if (heading) { tocPages.at(-1).push({ kind: "volume", title: entry.volumeTitle, top, height: layout.tocVolumeHeight }); top += layout.tocVolumeHeight; }
    tocPages.at(-1).push({ kind: "chapter", entry, top, height: rowHeight }); top += rowHeight; lastVolume = entry.volumeTitle;
  }
  const tocCount = tocPages.length;
  const leaves: BookLeaf[] = [{ ...blankLeaf("title"), kind: "title", title, label: "扉页", cursor: { kind: "front", pageIndex: 0 } }];
  for (let i = 0; i < tocCount; i++) leaves.push({ ...blankLeaf(`toc:${i}:${entries.map(e => `${e.chapterId}:${e.folio}`).join("|")}`),
    kind: "toc", title: "目录", label: `目录 ${i + 1} / ${tocCount}`, entries: tocPages[i].flatMap(row => row.kind === "chapter" ? [row.entry] : []), tocRows: tocPages[i], cursor: { kind: "front", pageIndex: i + 1 } });
  if (leaves.length % 2 !== 0) leaves.push(blankLeaf("front-padding"));
  return leaves;
}

export type BookContext = {
  title: string; chapters: ReaderChapter[]; entries: TocEntry[]; front: BookLeaf[]; double: boolean;
  loadChapter: (id: string) => Promise<ReaderLocation["chapter"]>;
};

export async function prepareBookSpread(requested: BookCursor, context: BookContext): Promise<BookSpread> {
  const { chapters, entries, front, double, loadChapter } = context;
  if (requested.kind === "cover") return { position: -2, key: `${double}:cover`, cursor: requested, leaves: [blankLeaf("inner-cover"), { ...coverLeaf(context.title), cursor: requested }], location: null, previous: null, next: { kind: "front", pageIndex: 0 } };
  const chapterCursor = (i: number, pageIndex = 0): Extract<BookCursor, { kind: "chapter" }> => ({ kind: "chapter", chapterId: chapters[i].id, pageIndex });
  const sectionStart = (i: number): BookCursor => i >= chapters.length ? { kind: "end", pageIndex: 0 } : { kind: entries[i].volumeStart ? "volume" : "chapter", chapterId: chapters[i].id, pageIndex: 0 };
  const chapterLength = async (i: number) => (await loadChapter(chapters[i].id)).pages.length;
  const lastSlot = async (i: number): Promise<BookCursor> => { const count = await chapterLength(i); return chapterCursor(i, count - 1); };
  // The physical side depends on preceding chapters, not the chapter-local index.
  // Direct jumps may arrive before background indexing finishes; resolve only the
  // missing prefix through the existing chapter cache instead of guessing parity.
  const bodyStart = async (index: number): Promise<number> => {
    if (entries[index].folio !== null) return entries[index].folio;
    let prefix = 0, first = 0;
    for (let i = index - 1; i >= 0; i--) {
      if (entries[i].folio !== null) { prefix = entries[i].folio - 1 + await chapterLength(i); first = i + 1; break; }
    }
    for (let i = first; i <= index; i++) {
      const start = prefix + (entries[i].volumeStart ? 2 : 0) + 1;
      if (i === index) return start;
      prefix = start - 1 + await chapterLength(i);
    }
    return 1;
  };
  const bodyTotal = async () => chapters.length ? await bodyStart(chapters.length - 1) - 1 + await chapterLength(chapters.length - 1) : 0;
  let cursor = requested;
  if (cursor.kind === "chapter") {
    const chapterId = cursor.chapterId, i = chapters.findIndex(c => c.id === chapterId);
    if (i < 0) throw new Error("章节已不在当前书籍中。");
    const count = await chapterLength(i);
    cursor = chapterCursor(i, Math.max(0, Math.min(cursor.pageIndex, count - 1)));
  }
  const adjacent = async (value: BookCursor, direction: number): Promise<BookCursor | null> => {
    const p = value.pageIndex;
    if (value.kind === "cover") return direction > 0 ? { kind: "front", pageIndex: 0 } : null;
    if (value.kind === "back") return direction > 0 ? null : { kind: "end", pageIndex: 1 };
    if (value.kind === "end") {
      if (direction > 0) return p === 0 ? { kind: "end", pageIndex: 1 } : { kind: "back", pageIndex: 0 };
      return p > 0 ? { kind: "end", pageIndex: 0 } : chapters.length ? lastSlot(chapters.length - 1) : { kind: "front", pageIndex: front.length - 1 };
    }
    if (value.kind === "front") {
      if (direction < 0) return p > 0 ? { kind: "front", pageIndex: p - 1 } : { kind: "cover", pageIndex: 0 };
      return p + 1 < front.length ? { kind: "front", pageIndex: p + 1 } : sectionStart(0);
    }
    const i = chapters.findIndex(c => c.id === value.chapterId);
    if (i < 0) throw new Error("章节已不在当前书籍中。");
    const beforeSection = () => i > 0 ? lastSlot(i - 1) : { kind: "front" as const, pageIndex: front.length - 1 };
    if (value.kind === "volume") return direction > 0 ? p === 0 ? { ...value, pageIndex: 1 } : chapterCursor(i) : p > 0 ? { ...value, pageIndex: 0 } : beforeSection();
    if (direction < 0) return p > 0 ? chapterCursor(i, p - 1) : entries[i].volumeStart ? { kind: "volume", chapterId: value.chapterId, pageIndex: 1 } : beforeSection();
    const count = await chapterLength(i);
    return p + 1 < count ? chapterCursor(i, p + 1) : sectionStart(i + 1);
  };
  const leaf = async (value: BookCursor | null): Promise<BookLeaf> => {
    if (!value || value.kind === "cover") return blankLeaf("inner-cover");
    if (value.kind === "front") return { ...front[value.pageIndex], cursor: value };
    if (value.kind === "back") return { ...coverLeaf(context.title), id: "back", kind: "back", cursor: value, label: "封底" };
    if (value.kind === "end") return value.pageIndex ? { ...blankLeaf("end-padding"), cursor: value } : { ...blankLeaf("end"), kind: "end", title: chapters.length ? "本次阅读已到末尾" : "还没有可阅读的正文", label: "阅读完成", cursor: value };
    const i = chapters.findIndex(c => c.id === value.chapterId), entry = entries[i];
    if (value.kind === "volume") return { ...blankLeaf(`volume:${value.chapterId}:${value.pageIndex}`), kind: value.pageIndex ? "blank" : "volume", title: entry.volumeTitle, cursor: value,
      folio: entry.volumeFolio === null ? null : entry.volumeFolio + value.pageIndex, label: value.pageIndex ? "分卷留白" : entry.volumeTitle };
    const measured = await loadChapter(value.chapterId), page = measured.pages[value.pageIndex];
    const folio = await bodyStart(i) + value.pageIndex;
    if (!page) throw new Error("目标正文页不存在，请重新打开书籍。");
    return { id: `${page.id}:${folio}`, kind: "content", title: entry.title, page, folio,
      label: folio === null ? `${entry.title} · 本章第 ${value.pageIndex + 1} 页` : `正文第 ${folio} 页`, location: { chapter: measured, pageIndex: value.pageIndex }, cursor: value };
  };
  const physicalIndex = cursor.kind === "chapter" || cursor.kind === "volume"
    ? front.length + await bodyStart(chapters.findIndex(c => c.id === cursor.chapterId)) - 1 + cursor.pageIndex - (cursor.kind === "volume" ? 2 : 0)
    : cursor.kind === "front" ? cursor.pageIndex
    : front.length + await bodyTotal() + (cursor.kind === "back" ? 2 : cursor.pageIndex);
  const isRecto = physicalIndex % 2 === 0;
  const leftCursor = double ? isRecto ? await adjacent(cursor, -1) : cursor : null;
  const rightCursor = double && !isRecto ? await adjacent(cursor, 1) : cursor;
  const left = await leaf(leftCursor), right = await leaf(rightCursor);
  const requestedChapter = cursor.kind === "chapter" ? cursor.chapterId : null;
  const location = requestedChapter ? [left, right].find(l => l.location?.chapter.chapterId === requestedChapter)?.location ?? null : null;
  return { position: double && isRecto ? physicalIndex - 1 : physicalIndex, key: `${double}:${left.id}|${right.id}`, cursor, leaves: [left, right], location,
    previous: leftCursor?.kind === "cover" ? leftCursor : leftCursor || !double ? await adjacent(double ? leftCursor : rightCursor, -1) : null,
    next: rightCursor ? await adjacent(rightCursor, 1) : null };
}

export function neighborCursor(spread: BookSpread, direction: number): BookCursor | null {
  return direction > 0 ? spread.next : spread.previous;
}

