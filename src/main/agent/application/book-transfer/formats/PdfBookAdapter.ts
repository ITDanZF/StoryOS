import { BrowserWindow } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExportBookOptions } from '../../bookTransferContracts.ts';
import type { BookExportSnapshot } from '../PortableBook.ts';
import { documentToHtml, escapeHtml, orderedSnapshotChapters } from '../BookTextCodec.ts';

export async function exportPdfBook(
  snapshot: BookExportSnapshot,
  options: ExportBookOptions,
): Promise<Buffer> {
  const sections: string[] = [];
  if (options.includeTitlePage !== false) {
    sections.push(`<section class="title-page"><h1>${escapeHtml(snapshot.title)}</h1>${options.includeSynopsis !== false && snapshot.synopsis ? `<p>${escapeHtml(snapshot.synopsis)}</p>` : ''}</section>`);
  }
  let previousVolume: string | null = null;
  for (const item of orderedSnapshotChapters(snapshot)) {
    if (item.volume && item.volume.title !== previousVolume) {
      sections.push(`<section class="volume"><h1>${escapeHtml(item.volume.title)}</h1>${options.includeVolumeSummaries && item.volume.summary ? `<p>${escapeHtml(item.volume.summary)}</p>` : ''}</section>`);
      previousVolume = item.volume.title;
    }
    sections.push(`<section class="chapter"><h2>${escapeHtml(item.chapter.title)}</h2>${documentToHtml(item.chapter.document)}</section>`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:22mm 20mm}body{font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;color:#171717;line-height:1.85;font-size:12pt}.title-page{display:flex;min-height:85vh;flex-direction:column;justify-content:center;text-align:center;page-break-after:always}.title-page h1{font-size:28pt}.volume{page-break-before:always;text-align:center;padding-top:30vh}.chapter{${options.chapterPageBreaks === false ? '' : 'page-break-before:always;'}}.chapter h2{text-align:center;margin-bottom:2em}.chapter p{text-indent:2em;margin:.65em 0}.chapter blockquote{border-left:3px solid #aaa;padding-left:1em;color:#555}</style></head><body>${sections.join('')}</body></html>`;
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const workRoot = mkdtempSync(path.join(tmpdir(), 'storyos-pdf-'));
  const htmlPath = path.join(workRoot, 'book.html');
  try {
    writeFileSync(htmlPath, html, 'utf8');
    await window.loadFile(htmlPath);
    return await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    if (!window.isDestroyed()) window.destroy();
    rmSync(workRoot, { recursive: true, force: true });
  }
}
