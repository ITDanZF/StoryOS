import path from "node:path";
import { chapterCharacterCount } from "./BookTextCodec.ts";
import { type BookTransferFormat, type ImportPreview } from "./bookTransferContracts.ts";
import type { BookExportSnapshot, PortableBookDraft } from "./PortableBook.ts";
export function createImportPreview(input: {
  readonly sessionId: string;
  readonly format: Exclude<BookTransferFormat, "epub" | "pdf">;
  readonly filePath: string;
  readonly fileSize: number;
  readonly fingerprint: string;
  readonly snapshot: BookExportSnapshot;
  readonly sourceApplicationVersion: string | null;
  readonly sourceFormatVersion: number | null;
  readonly exportedAt: string | null;
  readonly includesRevisionHistory: boolean;
  readonly warnings: ImportPreview["warnings"];
}): ImportPreview {
  const toChapter = (chapter: BookExportSnapshot["ungroupedChapters"][number]) =>
    Object.freeze({
      key: chapter.id,
      title: chapter.title,
      characterCount: chapter.characterCount,
    });
  const volumes = input.snapshot.volumes.map((volume) =>
    Object.freeze({
      key: volume.id,
      title: volume.title,
      chapters: Object.freeze(volume.chapters.map(toChapter)),
    }),
  );
  const ungroupedChapters = input.snapshot.ungroupedChapters.map(toChapter);
  return Object.freeze({
    sessionId: input.sessionId,
    format: input.format,
    fileName: path.basename(input.filePath),
    fileSize: input.fileSize,
    fingerprint: input.fingerprint,
    title: input.snapshot.title,
    synopsis: input.snapshot.synopsis,
    volumes: Object.freeze(volumes),
    ungroupedChapters: Object.freeze(ungroupedChapters),
    chapterCount:
      volumes.reduce((total, volume) => total + volume.chapters.length, 0) +
      ungroupedChapters.length,
    characterCount: input.snapshot.characterCount,
    includesRevisionHistory: input.includesRevisionHistory,
    sourceApplicationVersion: input.sourceApplicationVersion,
    sourceFormatVersion: input.sourceFormatVersion,
    exportedAt: input.exportedAt,
    warnings: Object.freeze(input.warnings),
  });
}

export function createDraftPreview(
  sessionId: string,
  format: Exclude<BookTransferFormat, "epub" | "pdf">,
  filePath: string,
  fileSize: number,
  fingerprint: string,
  draft: PortableBookDraft,
): ImportPreview {
  const toChapter = (chapter: PortableBookDraft["ungroupedChapters"][number]) =>
    Object.freeze({
      key: chapter.key,
      title: chapter.title,
      characterCount: chapterCharacterCount(chapter),
    });
  const volumes = draft.volumes.map((volume) =>
    Object.freeze({
      key: volume.key,
      title: volume.title,
      chapters: Object.freeze(volume.chapters.map(toChapter)),
    }),
  );
  const ungroupedChapters = draft.ungroupedChapters.map(toChapter);
  return Object.freeze({
    sessionId,
    format,
    fileName: path.basename(filePath),
    fileSize,
    fingerprint,
    title: draft.title,
    synopsis: draft.synopsis,
    volumes: Object.freeze(volumes),
    ungroupedChapters: Object.freeze(ungroupedChapters),
    chapterCount:
      volumes.reduce((total, volume) => total + volume.chapters.length, 0) +
      ungroupedChapters.length,
    characterCount: [
      ...draft.ungroupedChapters,
      ...draft.volumes.flatMap((volume) => volume.chapters),
    ].reduce((total, chapter) => total + chapterCharacterCount(chapter), 0),
    includesRevisionHistory: false,
    sourceApplicationVersion: null,
    sourceFormatVersion: null,
    exportedAt: null,
    warnings: Object.freeze(draft.warnings),
  });
}
