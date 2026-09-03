import JSZip from 'jszip';
import path from 'node:path';
import type { ExportBookOptions } from '../../bookTransferContracts.ts';
import type { BookExportSnapshot, PortableBookDraft } from '../PortableBook.ts';
import { plainTextToTiptapDocument } from '../../../../../shared/book/richText.ts';
import {
  documentToMarkdown,
  orderedSnapshotChapters,
  parseStructuredPlainText,
} from '../BookTextCodec.ts';

function markdownToStructuredText(value: string): string {
  return value
    .replace(/^#\s+.+$/m, '')
    .replace(/^##\s+(.+)$/gm, '$1')
    .replace(/^###\s+(.+)$/gm, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

export async function importMarkdownBook(content: Buffer, filePath: string): Promise<PortableBookDraft> {
  const extension = path.extname(filePath).toLocaleLowerCase('en-US');
  if (extension !== '.zip') {
    return parseStructuredPlainText(
      markdownToStructuredText(content.toString('utf8')),
      path.basename(filePath, extension),
    );
  }
  const zip = await JSZip.loadAsync(content, { checkCRC32: true });
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLocaleLowerCase('en-US').endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  if (files.length === 0) throw new Error('Markdown archive contains no .md files.');
  if (files.length > 10_000) throw new Error('Markdown archive contains too many files.');
  const manifestEntry = zip.file('book.json');
  let manifest: { title?: unknown; synopsis?: unknown; status?: unknown } = {};
  if (manifestEntry) {
    try {
      manifest = JSON.parse(await manifestEntry.async('string')) as typeof manifest;
    } catch {
      throw new Error('Markdown archive contains an invalid book.json manifest.');
    }
  }
  const grouped = new Map<string, Array<{ title: string; content: string }>>();
  let totalBytes = 0;
  for (const file of files) {
    if (file.name.includes('..') || path.isAbsolute(file.name)) throw new Error('Unsafe Markdown archive path.');
    const value = await file.async('string');
    totalBytes += Buffer.byteLength(value);
    if (totalBytes > 512 * 1024 * 1024) throw new Error('Markdown archive expands beyond the maximum size.');
    const segments = file.name.split('/').filter(Boolean);
    const directory = segments.length > 1 ? segments.at(-2) ?? '正文' : '正文';
    const fileTitle = path.basename(file.name, path.extname(file.name))
      .replace(/^\d+[-_.\s]+/, '').trim() || '未命名章节';
    const chapterTitle = value.match(/^#\s+(.+)$/m)?.[1]?.trim() || fileTitle;
    const chapters = grouped.get(directory) ?? [];
    chapters.push({
      title: chapterTitle,
      content: markdownToStructuredText(value.replace(/^#\s+.+$/m, '')),
    });
    grouped.set(directory, chapters);
  }
  const toChapter = (chapter: { title: string; content: string }, index: number) => Object.freeze({
    key: `chapter-${index + 1}-${chapter.title}`,
    title: chapter.title,
    status: chapter.content.trim() ? 'draft' as const : 'outline' as const,
    document: plainTextToTiptapDocument(chapter.content),
  });
  const ungrouped = grouped.get('正文') ?? [];
  const volumes = [...grouped.entries()]
    .filter(([directory]) => directory !== '正文')
    .map(([title, chapters], index) => Object.freeze({
      key: `volume-${index + 1}`,
      title,
      summary: '',
      chapters: Object.freeze(chapters.map(toChapter)),
    }));
  const status = ['planning', 'writing', 'completed', 'archived'].includes(manifest.status as string)
    ? manifest.status as PortableBookDraft['status']
    : 'planning';
  return Object.freeze({
    title: typeof manifest.title === 'string' && manifest.title.trim()
      ? manifest.title.trim()
      : path.basename(filePath, extension),
    synopsis: typeof manifest.synopsis === 'string' ? manifest.synopsis.trim() : '',
    status,
    volumes: Object.freeze(volumes),
    ungroupedChapters: Object.freeze(ungrouped.map(toChapter)),
    warnings: Object.freeze([]),
  });
}

function safeSegment(value: string): string {
  const printable = Array.from(value.trim())
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('');
  return printable.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').slice(0, 120) || '未命名';
}

export async function exportMarkdownBook(
  snapshot: BookExportSnapshot,
  options: ExportBookOptions,
): Promise<{ readonly content: Buffer; readonly extension: 'md' | 'zip' }> {
  if (!options.markdownBundle) {
    const lines = [`# ${snapshot.title}`, ''];
    if (options.includeSynopsis !== false && snapshot.synopsis) lines.push(snapshot.synopsis, '');
    let previousVolume: string | null = null;
    for (const item of orderedSnapshotChapters(snapshot)) {
      if (item.volume && item.volume.title !== previousVolume) {
        lines.push(`## ${item.volume.title}`, '');
        if (options.includeVolumeSummaries && item.volume.summary) lines.push(item.volume.summary, '');
        previousVolume = item.volume.title;
      }
      lines.push(`### ${item.chapter.title}`, '', documentToMarkdown(item.chapter.document), '');
    }
    return { content: Buffer.from(lines.join('\n').trimEnd() + '\n'), extension: 'md' };
  }
  const zip = new JSZip();
  zip.file('book.json', JSON.stringify({
    format: 'storyos-markdown',
    version: 1,
    title: snapshot.title,
    synopsis: snapshot.synopsis,
    status: snapshot.status,
  }, null, 2));
  let chapterNumber = 0;
  for (const item of orderedSnapshotChapters(snapshot)) {
    chapterNumber += 1;
    const directory = item.volume ? `${safeSegment(item.volume.title)}/` : '正文/';
    const fileName = `${String(chapterNumber).padStart(4, '0')}-${safeSegment(item.chapter.title)}.md`;
    zip.file(`${directory}${fileName}`, `# ${item.chapter.title}\n\n${documentToMarkdown(item.chapter.document)}\n`);
  }
  return {
    content: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }),
    extension: 'zip',
  };
}
