import mammoth from 'mammoth';
import { load } from 'cheerio';
import path from 'node:path';
import {
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';
import type { ExportBookOptions } from '../../bookTransferContracts.ts';
import type { BookExportSnapshot, PortableBookDraft } from '../PortableBook.ts';
import {
  documentToPlainText,
  orderedSnapshotChapters,
  parseStructuredPlainText,
} from '../BookTextCodec.ts';

const VOLUME_PATTERN = /^第[零〇一二三四五六七八九十百千万两\d]+卷/;
const CHAPTER_PATTERN = /^(第[零〇一二三四五六七八九十百千万两\d]+章|chapter\s+\d+)/i;

export async function importDocxBook(content: Buffer, filePath: string): Promise<PortableBookDraft> {
  const converted = await mammoth.convertToHtml({ buffer: content }, {
    includeDefaultStyleMap: true,
    ignoreEmptyParagraphs: false,
  });
  const $ = load(converted.value);
  const lines: string[] = [];
  let title = path.basename(filePath, path.extname(filePath));
  let sawTitle = false;
  $('body').children().each((_index, element) => {
    const tag = element.tagName?.toLocaleLowerCase('en-US') ?? '';
    const text = $(element).text().replace(/\u00a0/g, ' ').trim();
    if (!text && tag !== 'p') return;
    if (/^h[1-6]$/.test(tag)) {
      if (!sawTitle && tag === 'h1' && !VOLUME_PATTERN.test(text) && !CHAPTER_PATTERN.test(text)) {
        title = text;
        sawTitle = true;
        return;
      }
      if (VOLUME_PATTERN.test(text)) lines.push(text);
      else if (CHAPTER_PATTERN.test(text)) lines.push(text);
      else lines.push(`第${Math.max(lines.filter((line) => CHAPTER_PATTERN.test(line)).length + 1, 1)}章 ${text}`);
      return;
    }
    lines.push(text, '');
  });
  const draft = parseStructuredPlainText(lines.join('\n'), title);
  const messages = converted.messages.map((message) => ({
    code: 'docx-conversion',
    message: message.message,
    severity: 'warning' as const,
  }));
  return Object.freeze({
    ...draft,
    warnings: Object.freeze([
      ...messages,
      Object.freeze({
        code: 'docx-revisions-not-preserved',
        message: 'Word 批注、修订跟踪、文本框和复杂版式不会作为 StoryOS 修订历史导入。',
        severity: 'info' as const,
      }),
    ]),
  });
}

export async function exportDocxBook(
  snapshot: BookExportSnapshot,
  options: ExportBookOptions,
): Promise<Buffer> {
  const paragraphs: (Paragraph | TableOfContents)[] = [];
  if (options.includeTitlePage !== false) {
    paragraphs.push(new Paragraph({ text: snapshot.title, heading: HeadingLevel.TITLE }));
  }
  if (options.includeSynopsis !== false && snapshot.synopsis) {
    paragraphs.push(new Paragraph({ children: [new TextRun(snapshot.synopsis)] }));
  }
  if (options.includeTitlePage !== false) {
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (options.includeTableOfContents !== false) {
    paragraphs.push(new TableOfContents('目录', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }));
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
  }
  let previousVolume: string | null = null;
  for (const item of orderedSnapshotChapters(snapshot)) {
    if (item.volume && item.volume.title !== previousVolume) {
      paragraphs.push(new Paragraph({ text: item.volume.title, heading: HeadingLevel.HEADING_1 }));
      if (options.includeVolumeSummaries && item.volume.summary) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: item.volume.summary, italics: true })] }));
      }
      previousVolume = item.volume.title;
    }
    if (options.chapterPageBreaks && paragraphs.length > 0) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }
    paragraphs.push(new Paragraph({ text: item.chapter.title, heading: HeadingLevel.HEADING_2 }));
    const text = documentToPlainText(item.chapter.document);
    const sourceParagraphs = text.split(/\n{2,}/);
    for (const paragraph of sourceParagraphs) {
      paragraphs.push(new Paragraph({ children: [new TextRun(paragraph)] }));
    }
  }
  const document = new Document({
    features: { updateFields: true },
    sections: [{ children: paragraphs }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}
