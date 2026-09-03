import {
  extractTiptapText,
  plainTextToTiptapDocument,
  type TiptapDocument,
  type TiptapNode,
} from '../../../../shared/book/richText.ts';
import type {
  BookExportChapter,
  BookExportSnapshot,
  PortableBookDraft,
  PortableChapterDraft,
  PortableVolumeDraft,
} from './PortableBook.ts';

const VOLUME_HEADING = /^\s*(第[零〇一二三四五六七八九十百千万两\d]+卷|卷[零〇一二三四五六七八九十百千万两\d]+)(?:[\s\u3000:：·.-]+(.*))?\s*$/i;
const CHAPTER_HEADING = /^\s*(第[零〇一二三四五六七八九十百千万两\d]+章|chapter\s+[\divxlcdm]+)(?:[\s\u3000:：·.-]+(.*))?\s*$/i;

function normalizedTitle(match: RegExpMatchArray, fallback: string): string {
  const suffix = match[2]?.trim();
  return suffix ? `${match[1]} ${suffix}` : match[1]?.trim() || fallback;
}

export function parseStructuredPlainText(
  value: string,
  fallbackTitle: string,
): PortableBookDraft {
  const lines = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const volumes: Array<{ title: string; chapters: PortableChapterDraft[] }> = [];
  const ungroupedChapters: PortableChapterDraft[] = [];
  let currentVolume: { title: string; chapters: PortableChapterDraft[] } | null = null;
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let chapterIndex = 0;

  const flushChapter = () => {
    const body = currentLines.join('\n').trim();
    if (!currentTitle && !body) return;
    chapterIndex += 1;
    const chapter: PortableChapterDraft = Object.freeze({
      key: `chapter-${chapterIndex}`,
      title: currentTitle ?? (chapterIndex === 1 ? '正文' : `第 ${chapterIndex} 章`),
      status: body ? 'draft' : 'outline',
      document: plainTextToTiptapDocument(body),
    });
    if (currentVolume) currentVolume.chapters.push(chapter);
    else ungroupedChapters.push(chapter);
    currentTitle = null;
    currentLines = [];
  };

  for (const line of lines) {
    const volumeMatch = line.match(VOLUME_HEADING);
    if (volumeMatch) {
      flushChapter();
      currentVolume = {
        title: normalizedTitle(volumeMatch, `第 ${volumes.length + 1} 卷`),
        chapters: [],
      };
      volumes.push(currentVolume);
      continue;
    }
    const chapterMatch = line.match(CHAPTER_HEADING);
    if (chapterMatch) {
      flushChapter();
      currentTitle = normalizedTitle(chapterMatch, `第 ${chapterIndex + 1} 章`);
      continue;
    }
    currentLines.push(line);
  }
  flushChapter();
  if (volumes.length === 0 && ungroupedChapters.length === 0) {
    ungroupedChapters.push(Object.freeze({
      key: 'chapter-1',
      title: '正文',
      status: 'outline',
      document: plainTextToTiptapDocument(''),
    }));
  }
  const portableVolumes: PortableVolumeDraft[] = volumes.map((volume, index) => Object.freeze({
    key: `volume-${index + 1}`,
    title: volume.title,
    summary: '',
    chapters: Object.freeze(volume.chapters),
  }));
  return Object.freeze({
    title: fallbackTitle.trim() || '导入的书籍',
    synopsis: '',
    status: 'planning',
    volumes: Object.freeze(portableVolumes),
    ungroupedChapters: Object.freeze(ungroupedChapters),
    warnings: Object.freeze([]),
  });
}

export function documentToPlainText(document: TiptapDocument): string {
  return extractTiptapText(document);
}

function markWrapper(text: string, marks: unknown): string {
  if (!Array.isArray(marks)) return text;
  return marks.reduce((result, mark) => {
    const type = mark && typeof mark === 'object' && 'type' in mark
      ? String((mark as { type: unknown }).type)
      : '';
    if (type === 'bold') return `**${result}**`;
    if (type === 'italic') return `*${result}*`;
    if (type === 'strike') return `~~${result}~~`;
    return result;
  }, text);
}

function nodeToMarkdown(node: TiptapNode, depth = 0): string {
  if (node.type === 'text') return markWrapper(node.text ?? '', node.marks);
  if (node.type === 'hardBreak') return '  \n';
  const children = node.content?.map((child) => nodeToMarkdown(child, depth + 1)).join('') ?? '';
  if (node.type === 'heading') {
    const level = typeof node.attrs === 'object' && node.attrs && 'level' in node.attrs
      ? Number((node.attrs as { level: unknown }).level)
      : 2;
    return `${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${children.trim()}\n\n`;
  }
  if (node.type === 'paragraph') return `${children}\n\n`;
  if (node.type === 'blockquote') return children.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n') + '\n\n';
  if (node.type === 'bulletList' || node.type === 'orderedList') return `${children}\n`;
  if (node.type === 'listItem') return `${'  '.repeat(Math.max(depth - 2, 0))}- ${children.trim()}\n`;
  if (node.type === 'horizontalRule') return '---\n\n';
  return children;
}

export function documentToMarkdown(document: TiptapDocument): string {
  return (document.content?.map((node) => nodeToMarkdown(node)).join('') ?? '').trimEnd();
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function documentToHtml(document: TiptapDocument): string {
  return document.content?.map((node) => {
    if (node.type === 'heading') return `<h3>${escapeHtml(documentToPlainText({ type: 'doc', content: [node] }))}</h3>`;
    if (node.type === 'blockquote') return `<blockquote>${escapeHtml(documentToPlainText({ type: 'doc', content: [node] }))}</blockquote>`;
    const text = escapeHtml(documentToPlainText({ type: 'doc', content: [node] })).replace(/\n/g, '<br>');
    return `<p>${text || '&nbsp;'}</p>`;
  }).join('') ?? '';
}

export function orderedSnapshotChapters(snapshot: BookExportSnapshot): readonly {
  readonly volume: { readonly title: string; readonly summary: string } | null;
  readonly chapter: BookExportChapter;
}[] {
  type OrderedChapter = {
    readonly volume: { readonly title: string; readonly summary: string } | null;
    readonly chapter: BookExportChapter;
  };
  const ordered: OrderedChapter[] = snapshot.ungroupedChapters
    .slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((chapter): OrderedChapter => ({ volume: null, chapter }));
  for (const volume of snapshot.volumes.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
    for (const chapter of volume.chapters.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
      ordered.push({ volume: { title: volume.title, summary: volume.summary }, chapter });
    }
  }
  return Object.freeze(ordered);
}

export function chapterCharacterCount(chapter: PortableChapterDraft): number {
  return Array.from(documentToPlainText(chapter.document).replace(/\s/g, '')).length;
}
