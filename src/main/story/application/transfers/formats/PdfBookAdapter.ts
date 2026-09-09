import { pdfStyles } from "../../../resources/export-templates/pdfStyles.ts";
import { documentToHtml, escapeHtml, orderedSnapshotChapters } from "../BookTextCodec.ts";
import type { ExportBookOptions } from "../bookTransferContracts.ts";
import type { BookExportSnapshot } from "../PortableBook.ts";

export async function exportPdfBook(
  snapshot: BookExportSnapshot,
  options: ExportBookOptions,
  renderer: { render(html: string): Promise<Buffer> },
): Promise<Buffer> {
  const sections: string[] = [];
  if (options.includeTitlePage !== false) {
    sections.push(
      `<section class="title-page"><h1>${escapeHtml(snapshot.title)}</h1>${options.includeSynopsis !== false && snapshot.synopsis ? `<p>${escapeHtml(snapshot.synopsis)}</p>` : ""}</section>`,
    );
  }
  let previousVolume: string | null = null;
  for (const item of orderedSnapshotChapters(snapshot)) {
    if (item.volume && item.volume.title !== previousVolume) {
      sections.push(
        `<section class="volume"><h1>${escapeHtml(item.volume.title)}</h1>${options.includeVolumeSummaries && item.volume.summary ? `<p>${escapeHtml(item.volume.summary)}</p>` : ""}</section>`,
      );
      previousVolume = item.volume.title;
    }
    sections.push(
      `<section class="chapter"><h2>${escapeHtml(item.chapter.title)}</h2>${documentToHtml(item.chapter.document)}</section>`,
    );
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${pdfStyles(options.chapterPageBreaks !== false)}</style></head><body>${sections.join("")}</body></html>`;
  return renderer.render(html);
}
