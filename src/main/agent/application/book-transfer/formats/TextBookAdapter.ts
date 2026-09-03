import iconv from 'iconv-lite';
import path from 'node:path';
import type { ExportBookOptions } from '../../bookTransferContracts.ts';
import type { BookExportSnapshot, PortableBookDraft } from '../PortableBook.ts';
import {
  documentToPlainText,
  orderedSnapshotChapters,
  parseStructuredPlainText,
} from '../BookTextCodec.ts';

export function importTextBook(content: Buffer, filePath: string): PortableBookDraft {
  let text: string;
  if (content.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    text = iconv.decode(content, 'utf16-le');
  } else if (content.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    text = iconv.decode(content, 'utf16-be');
  } else {
    const utf8 = iconv.decode(content, 'utf8');
    const replacementRatio = (utf8.match(/�/g)?.length ?? 0) / Math.max(utf8.length, 1);
    text = replacementRatio > 0.001 ? iconv.decode(content, 'gb18030') : utf8;
  }
  return parseStructuredPlainText(text, path.basename(filePath, path.extname(filePath)));
}

export function exportTextBook(
  snapshot: BookExportSnapshot,
  options: ExportBookOptions,
): Buffer {
  const lines: string[] = [];
  if (options.includeTitlePage !== false) lines.push(snapshot.title, '');
  if (options.includeSynopsis !== false && snapshot.synopsis) lines.push(snapshot.synopsis, '');
  let previousVolume: string | null = null;
  for (const item of orderedSnapshotChapters(snapshot)) {
    if (item.volume && item.volume.title !== previousVolume) {
      lines.push(item.volume.title, '');
      if (options.includeVolumeSummaries && item.volume.summary) lines.push(item.volume.summary, '');
      previousVolume = item.volume.title;
    }
    lines.push(item.chapter.title, '', documentToPlainText(item.chapter.document), '');
  }
  return Buffer.from(lines.join('\r\n').trimEnd() + '\r\n', 'utf8');
}
