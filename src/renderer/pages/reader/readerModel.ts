import type { ReaderAnchor, ReaderManifest } from "../../../shared/book/reader.ts";

export type ReaderBlock = { html: string; top: number; height: number };
export type ReaderPage = { id: string; chapterId: string; index: number; from: number; to: number; top: number; height: number; blocks: ReaderBlock[]; text: string };
export type MeasuredChapter = { chapterId: string; revisionId: string | null; pages: ReaderPage[]; text: string; positions: Uint32Array; bytes: number };

export function orderedReaderChapters(manifest: ReaderManifest) {
  const volumes = [...manifest.volumes].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const order = new Map(volumes.map((v, i) => [v.id, i]));
  return [...manifest.chapters].sort((a, b) =>
    (a.volumeId === null ? volumes.length : order.get(a.volumeId)) -
    (b.volumeId === null ? volumes.length : order.get(b.volumeId)) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function textOffsetAt(positions: Uint32Array, position: number): number {
  let low = 0; let high = positions.length;
  while (low < high) { const mid = (low + high) >>> 1; if (positions[mid] < position) low = mid + 1; else high = mid; }
  return low;
}
function boundary(text: string, index: number): number {
  const clipped = Math.max(0, Math.min(index, text.length));
  // Intl.Segmenter preserves surrogate pairs and combining sequences in persisted quotes.
  for (const segment of new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text.slice(Math.max(0, clipped - 32), clipped + 32))) {
    const start = Math.max(0, clipped - 32) + segment.index;
    if (start + segment.segment.length > clipped) return start;
  }
  return clipped;
}
export function createReaderAnchor(chapter: MeasuredChapter, position: number): ReaderAnchor | null {
  if (!chapter.revisionId || !chapter.text.trim()) return null;
  const offset = boundary(chapter.text, textOffsetAt(chapter.positions, position));
  const end = boundary(chapter.text, offset + 64);
  return { chapterId: chapter.chapterId, revisionId: chapter.revisionId, position, textOffset: offset,
    quote: chapter.text.slice(offset, end), prefix: chapter.text.slice(boundary(chapter.text, offset - 24), offset),
    suffix: chapter.text.slice(end, boundary(chapter.text, end + 24)) };
}
export function restoreReaderAnchor(chapter: MeasuredChapter, anchor: ReaderAnchor | null): { position: number; relocated: boolean } {
  if (!anchor || anchor.chapterId !== chapter.chapterId) return { position: 1, relocated: Boolean(anchor) };
  if (anchor.revisionId === chapter.revisionId) return { position: anchor.position, relocated: false };
  if (anchor.quote) {
    const matches: number[] = [];
    let start = 0;
    while (start <= chapter.text.length) {
      const index = chapter.text.indexOf(anchor.quote, start);
      if (index < 0) break;
      matches.push(index); start = index + anchor.quote.length;
    }
    matches.sort((a, b) => {
      const score = (i: number) => Number(chapter.text.slice(Math.max(0, i - anchor.prefix.length), i) === anchor.prefix) +
        Number(chapter.text.slice(i + anchor.quote.length, i + anchor.quote.length + anchor.suffix.length) === anchor.suffix);
      return score(b) - score(a) || Math.abs(a - anchor.textOffset) - Math.abs(b - anchor.textOffset);
    });
    if (matches.length) return { position: chapter.positions[matches[0]] ?? 1, relocated: true };
  }
  return { position: 1, relocated: true };
}
export function pageAtPosition(chapter: MeasuredChapter, position: number): number {
  const found = chapter.pages.findIndex(p => p.to > position);
  return found < 0 ? Math.max(0, chapter.pages.length - 1) : found;
}

/** First spread is blank/1, followed by 2/3, 4/5. Indices are zero based. */
export function spreadStart(index: number): number { return index === 0 ? -1 : index % 2 === 0 ? index - 1 : index; }
export function spreadIndices(index: number, double: boolean): number[] { return double ? [spreadStart(index), spreadStart(index) + 1] : [index]; }

export class ReaderChapterCache {
  private readonly entries = new Map<string, MeasuredChapter>();
  constructor(private readonly budget = 24 * 1024 * 1024) {}
  get(key: string): MeasuredChapter | undefined {
    const found = this.entries.get(key);
    if (found) { this.entries.delete(key); this.entries.set(key, found); }
    return found;
  }
  set(key: string, chapter: MeasuredChapter): void {
    this.entries.delete(key); this.entries.set(key, chapter);
    let bytes = [...this.entries.values()].reduce((sum, value) => sum + value.bytes, 0);
    for (const [id, value] of this.entries) {
      if (bytes <= this.budget && this.entries.size <= 4) break;
      this.entries.delete(id); bytes -= value.bytes;
    }
  }
  clear(): void { this.entries.clear(); }
}
