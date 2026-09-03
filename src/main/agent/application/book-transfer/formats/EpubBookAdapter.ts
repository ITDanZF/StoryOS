import JSZip from 'jszip';
import type { ExportBookOptions } from '../../bookTransferContracts.ts';
import type { BookExportSnapshot } from '../PortableBook.ts';
import { documentToHtml, escapeHtml, orderedSnapshotChapters } from '../BookTextCodec.ts';

export async function exportEpubBook(
  snapshot: BookExportSnapshot,
  options: ExportBookOptions,
): Promise<Buffer> {
  void options;
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  const chapters = orderedSnapshotChapters(snapshot);
  const manifest: string[] = [];
  const spine: string[] = [];
  const navigation: string[] = [];
  chapters.forEach((item, index) => {
    const id = `chapter-${index + 1}`;
    const href = `${id}.xhtml`;
    manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    navigation.push(`<li><a href="${href}">${escapeHtml(item.chapter.title)}</a></li>`);
    zip.file(`OEBPS/${href}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeHtml(item.chapter.title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body>
${item.volume ? `<h2>${escapeHtml(item.volume.title)}</h2>` : ''}<h1>${escapeHtml(item.chapter.title)}</h1>${documentToHtml(item.chapter.document)}
</body></html>`);
  });
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${navigation.join('')}</ol></nav></body></html>`);
  zip.file('OEBPS/style.css', 'body{font-family:serif;line-height:1.8;margin:5%;}h1{page-break-before:always;}p{text-indent:2em;}');
  const identifier = `urn:uuid:${crypto.randomUUID()}`;
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${escapeHtml(snapshot.title)}</dc:title><dc:language>zh-CN</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
