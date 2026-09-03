export const STORYOS_BOOK_FORMAT_VERSION = 1;
export const MAX_STORYOS_BOOK_PACKAGE_BYTES = 512 * 1024 * 1024;

export type BookTransferFormat =
  | "storyos"
  | "text"
  | "markdown"
  | "docx"
  | "epub"
  | "pdf";

export type BookTransferFormatCapability = {
  readonly id: BookTransferFormat;
  readonly label: string;
  readonly description: string;
  readonly extensions: readonly string[];
  readonly canImport: boolean;
  readonly canExport: boolean;
  readonly preservesStructure: boolean;
  readonly preservesRichText: boolean;
  readonly preservesRevisions: boolean;
  readonly outputKind: "file" | "archive";
};

export type TransferWarning = {
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warning";
};

export type ImportPreviewChapter = {
  readonly key: string;
  readonly title: string;
  readonly characterCount: number;
};

export type ImportPreviewVolume = {
  readonly key: string;
  readonly title: string;
  readonly chapters: readonly ImportPreviewChapter[];
};

export type ImportPreview = {
  readonly sessionId: string;
  readonly format: Exclude<BookTransferFormat, "epub" | "pdf">;
  readonly fileName: string;
  readonly fileSize: number;
  readonly fingerprint: string;
  readonly title: string;
  readonly synopsis: string;
  readonly volumes: readonly ImportPreviewVolume[];
  readonly ungroupedChapters: readonly ImportPreviewChapter[];
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly includesRevisionHistory: boolean;
  readonly sourceApplicationVersion: string | null;
  readonly sourceFormatVersion: number | null;
  readonly exportedAt: string | null;
  readonly warnings: readonly TransferWarning[];
};

export type PrepareBookImportRequest = {
  readonly filePath: string;
  readonly expectedFormat?: Exclude<BookTransferFormat, "epub" | "pdf">;
};

export type CommitBookImportRequest = {
  readonly sessionId: string;
};

export type ExportBookOptions = {
  readonly includeTitlePage?: boolean;
  readonly includeSynopsis?: boolean;
  readonly includeVolumeSummaries?: boolean;
  readonly includeTableOfContents?: boolean;
  readonly chapterPageBreaks?: boolean;
  readonly markdownBundle?: boolean;
  readonly splitTextFiles?: boolean;
};

export type PrepareBookExportRequest = {
  readonly bookId: string;
  readonly format: BookTransferFormat;
  readonly options?: ExportBookOptions;
};

export type ExportPreview = {
  readonly exportId: string;
  readonly bookId: string;
  readonly title: string;
  readonly format: BookTransferFormat;
  readonly extension: string;
  readonly suggestedFileName: string;
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly warnings: readonly TransferWarning[];
};

export type CommitBookExportRequest = {
  readonly exportId: string;
  readonly outputPath: string;
};

export type ExportBookResult = {
  readonly operationId: string;
  readonly bookId: string;
  readonly title: string;
  readonly format: BookTransferFormat;
  readonly outputPath: string;
  readonly byteLength: number;
};

export type StoryOSBookManifest = {
  readonly format: "storyos-book";
  readonly formatVersion: number;
  readonly sourceBookId: string;
  readonly databaseApplicationId: number;
  readonly databaseUserVersion: number;
  readonly title: string;
  readonly exportedAt: string;
  readonly applicationVersion: string;
};

export type StoryOSBookChecksums = {
  readonly algorithm: "sha256";
  readonly files: {
    readonly "manifest.json": string;
    readonly "book.sqlite": string;
  };
};

export type ExportBookRequest = {
  readonly bookId: string;
  readonly outputPath: string;
};

export type ImportBookRequest = {
  readonly packagePath: string;
};

export type ImportBookResult = {
  readonly operationId: string;
  readonly bookId: string;
  readonly sourceBookId: string;
  readonly title: string;
  readonly format?: BookTransferFormat;
};
