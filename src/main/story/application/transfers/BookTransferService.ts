import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { APP_VERSION } from "../../../../shared/appInfo.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import type { BookRegistry } from "../books/bookRegistryPorts.ts";
import NovelApplication from "../books/NovelApplication.ts";
import BookDatabase, {
  BOOK_DATABASE_APPLICATION_ID,
  BOOK_DATABASE_SCHEMA_VERSION,
} from "../../storage/book/BookDatabase.ts";
import SqliteNovelStore from "../../storage/book/SqliteNovelStore.ts";
import BookExportSnapshotReader from "./BookExportSnapshotReader.ts";
import BookFormatRegistry from "./BookFormatRegistry.ts";
import BookImportWriter from "./BookImportWriter.ts";
import {
  MAX_STORYOS_BOOK_PACKAGE_BYTES,
  STORYOS_BOOK_FORMAT_VERSION,
  type BookTransferFormat,
  type BookTransferFormatCapability,
  type CommitBookExportRequest,
  type CommitBookImportRequest,
  type ExportBookOptions,
  type ExportBookRequest,
  type ExportBookResult,
  type ExportPreview,
  type ImportBookRequest,
  type ImportBookResult,
  type ImportPreview,
  type PrepareBookExportRequest,
  type PrepareBookImportRequest,
  type StoryOSBookManifest,
} from "./bookTransferContracts.ts";
import ExportFilePublisher from "./ExportFilePublisher.ts";
import type { BookExportSnapshot, PortableBookDraft } from "./PortableBook.ts";
import { createDraftPreview, createImportPreview } from "./preview.ts";
import PreviewStagingDirectory from "./PreviewStagingDirectory.ts";
import { createStoryOSBookPackage, readStoryOSBookPackage, sha256 } from "./StoryOSBookPackage.ts";
import TransferSessionManager from "./TransferSessionManager.ts";

type ImportSession = {
  readonly sessionId: string;
  readonly rootPath: string;
  readonly sourcePath: string;
  readonly format: Exclude<BookTransferFormat, "epub" | "pdf">;
  readonly fingerprint: string;
  readonly preview: ImportPreview;
  readonly native?: ReturnType<typeof readStoryOSBookPackage>;
  readonly draft?: PortableBookDraft;
};

type ExportSession = {
  readonly exportId: string;
  readonly native?: Buffer;
  readonly snapshot: BookExportSnapshot;
  readonly format: BookTransferFormat;
  readonly options: ExportBookOptions;
  readonly preview: ExportPreview;
};

export default class BookTransferService {
  private readonly staging: PreviewStagingDirectory;
  private readonly files: ExportFilePublisher;
  private readonly snapshots: BookExportSnapshotReader;
  private readonly writer: BookImportWriter;

  private readonly importSessions = new TransferSessionManager<ImportSession>();
  private readonly exportSessions = new TransferSessionManager<ExportSession>();

  constructor(
    private readonly agentHome: string,
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
    private readonly formats = new BookFormatRegistry(),
  ) {
    this.staging = new PreviewStagingDirectory(agentHome);
    this.staging.recover();
    this.files = new ExportFilePublisher();
    this.snapshots = new BookExportSnapshotReader(runtimes);
    this.writer = new BookImportWriter(agentHome, books, runtimes, this.snapshots, this.files);
  }

  closeOwner(owner: number): void {
    this.importSessions.closeOwner(owner);
    this.exportSessions.closeOwner(owner);
  }
  get hasActiveTransfer(): boolean {
    return this.importSessions.busy || this.exportSessions.busy;
  }
  async dispose(): Promise<void> {
    await Promise.all([this.importSessions.close(), this.exportSessions.close()]);
  }

  listFormats(): readonly BookTransferFormatCapability[] {
    return this.formats.list();
  }

  async prepareImport(request: PrepareBookImportRequest): Promise<ImportPreview> {
    const filePath = this.files.requireImportPath(request.filePath);
    const format = this.formats.detect(filePath);
    if (request.expectedFormat && request.expectedFormat !== format) {
      throw new Error(`Selected format does not match the file: ${request.expectedFormat}`);
    }
    const stats = statSync(filePath);
    if (stats.size > MAX_STORYOS_BOOK_PACKAGE_BYTES) {
      throw new Error("Book import file exceeds the maximum size.");
    }
    const sessionId = `book_import_preview_${crypto.randomUUID()}`;
    const rootPath = path.join(this.agentHome, "library", ".importing", sessionId);
    const sourcePath = path.join(rootPath, path.basename(filePath));
    this.importSessions.reserve(sessionId, () => this.staging.remove(sessionId));
    try {
      this.staging.create(sessionId);
      copyFileSync(filePath, sourcePath);
      const content = readFileSync(sourcePath);
      const fingerprint = sha256(content);
      let native: ReturnType<typeof readStoryOSBookPackage> | undefined;
      let draft: PortableBookDraft | undefined;
      let preview: ImportPreview;
      if (format === "storyos") {
        native = readStoryOSBookPackage(content);
        this.writer.validateNativePackage(native);
        const databasePath = path.join(rootPath, "preview.sqlite");
        writeFileSync(databasePath, native.database, { flag: "wx" });
        const snapshot = this.snapshots.readSnapshotFromDatabase(
          databasePath,
          native.manifest.sourceBookId,
        );
        preview = createImportPreview({
          sessionId,
          format,
          filePath,
          fileSize: stats.size,
          fingerprint,
          snapshot,
          sourceApplicationVersion: native.manifest.applicationVersion,
          sourceFormatVersion: native.manifest.formatVersion,
          exportedAt: native.manifest.exportedAt,
          includesRevisionHistory: true,
          warnings: [],
        });
      } else {
        draft = await this.formats.parse(format, content, filePath);
        preview = createDraftPreview(sessionId, format, filePath, stats.size, fingerprint, draft);
      }
      const session = Object.freeze({
        sessionId,
        rootPath,
        sourcePath,
        format,
        fingerprint,
        preview,
        ...(native ? { native } : {}),
        ...(draft ? { draft } : {}),
      });
      this.importSessions.set(sessionId, session);
      return preview;
    } catch (error) {
      this.importSessions.finish(sessionId);
      throw error;
    }
  }

  async commitImport(request: CommitBookImportRequest): Promise<ImportBookResult> {
    const session = this.importSessions.claim(request.sessionId);
    if (!session) throw new Error("Book import session has expired or was cancelled.");
    try {
      if (session.native) return this.writer.importParsedNativeBook(session.native);
      if (!session.draft) throw new Error("Book import session contains no parsed draft.");
      return this.writer.importPortableDraft(session.draft, session.fingerprint, session.format);
    } finally {
      this.importSessions.finish(session.sessionId);
    }
  }

  cancelImport(sessionId: string): void {
    this.importSessions.cancel(sessionId);
  }

  prepareExport(request: PrepareBookExportRequest): ExportPreview {
    const capability = this.formats.capability(request.format);
    if (!capability.canExport) throw new Error(`Format cannot be exported: ${request.format}`);
    if (this.exportSessions.size >= 8)
      throw new Error("Too many pending export previews; close an existing preview first.");
    const captured =
      request.format === "storyos"
        ? this.runtimes.captureBook(request.bookId, () =>
            this.snapshots.readBookSnapshot(request.bookId),
          )
        : null;
    const snapshot = captured ? captured.snapshot : this.snapshots.readBookSnapshot(request.bookId);
    const native = captured
      ? createStoryOSBookPackage(
          {
            format: "storyos-book",
            formatVersion: STORYOS_BOOK_FORMAT_VERSION,
            sourceBookId: request.bookId,
            databaseApplicationId: BOOK_DATABASE_APPLICATION_ID,
            databaseUserVersion: BOOK_DATABASE_SCHEMA_VERSION,
            title: snapshot.title,
            exportedAt: new Date().toISOString(),
            applicationVersion: APP_VERSION,
          },
          captured.database,
        )
      : undefined;
    const options = Object.freeze({ ...request.options });
    const extension =
      request.format === "markdown" && options.markdownBundle ? "zip" : capability.extensions[0];
    if (!extension) throw new Error(`Export format has no extension: ${request.format}`);
    const exportId = `book_export_preview_${crypto.randomUUID()}`;
    const preview: ExportPreview = Object.freeze({
      exportId,
      bookId: snapshot.bookId,
      title: snapshot.title,
      format: request.format,
      extension,
      suggestedFileName: `${this.files.safeFileName(snapshot.title)}.${extension}`,
      chapterCount:
        snapshot.volumes.reduce((total, volume) => total + volume.chapters.length, 0) +
        snapshot.ungroupedChapters.length,
      characterCount: snapshot.characterCount,
      warnings: Object.freeze(
        request.format === "storyos"
          ? []
          : [
              {
                code: "revision-history-not-exported",
                message: "此格式只导出每章当前版本，不包含 StoryOS 修订历史和项目对话。",
                severity: "info" as const,
              },
            ],
      ),
    });
    this.exportSessions.set(
      exportId,
      Object.freeze({
        exportId,
        native,
        snapshot,
        format: request.format,
        options,
        preview,
      }),
    );
    return preview;
  }

  async commitExport(request: CommitBookExportRequest): Promise<ExportBookResult> {
    const session = this.exportSessions.inspect(request.exportId);
    if (!session) throw new Error("Book export session has expired or was cancelled.");
    const outputPath = this.files.requireFormatOutputPath(
      request.outputPath,
      session.preview.extension,
    );
    this.files.requireExportTarget(outputPath, request.overwrite === true);
    this.exportSessions.claim(request.exportId);
    try {
      const content =
        session.format === "storyos"
          ? session.native
          : await this.renderExport(session.snapshot, session.format, session.options);
      if (!content) throw new Error("Export snapshot content is missing.");
      const temporary = path.join(
        path.dirname(outputPath),
        `.${path.basename(outputPath)}.${crypto.randomUUID()}.tmp`,
      );
      try {
        writeFileSync(temporary, content, { flag: "wx" });
        this.files.publishExportFile(temporary, outputPath, request.overwrite === true);
      } finally {
        rmSync(temporary, { force: true });
      }
      return Object.freeze({
        operationId: `book_export_${crypto.randomUUID()}`,
        bookId: session.snapshot.bookId,
        title: session.snapshot.title,
        format: session.format,
        outputPath,
        byteLength: statSync(outputPath).size,
      });
    } finally {
      this.exportSessions.finish(request.exportId);
    }
  }

  cancelExport(exportId: string): void {
    this.exportSessions.cancel(exportId);
  }

  async exportBook(request: ExportBookRequest): Promise<void> {
    const book = this.books.getBookById(request.bookId);
    if (!book) throw new Error(`Book not found: ${request.bookId}`);
    if (book.state !== "available") {
      throw new Error(`Book storage is unavailable: ${book.id}`);
    }
    const outputPath = this.files.requirePackagePath(request.outputPath);
    this.files.requireExportTarget(outputPath, request.overwrite === true);
    const outputParent = path.dirname(outputPath);
    if (!existsSync(outputParent) || !statSync(outputParent).isDirectory()) {
      throw new Error(`Export directory does not exist: ${outputParent}`);
    }
    const operationId = `book_export_${crypto.randomUUID()}`;
    const workRoot = path.join(this.agentHome, "library", ".exporting", operationId);
    const snapshotPath = path.join(workRoot, "book.sqlite");
    const temporaryOutput = path.join(
      outputParent,
      `.${path.basename(outputPath)}.${operationId}.tmp`,
    );
    mkdirSync(workRoot, { recursive: true });
    try {
      await this.runtimes.backupBook(book.id, snapshotPath);
      BookDatabase.validateExisting(snapshotPath);
      const database = new BookDatabase(snapshotPath);
      let title: string;
      try {
        const novel = new NovelApplication(
          new SqliteNovelStore(database.handle, this.runtimes.deviceId),
        ).getProjectBook();
        if (!novel) throw new Error(`Book contains no novel record: ${book.id}`);
        title = novel.title;
      } finally {
        database.close();
      }
      const manifest: StoryOSBookManifest = Object.freeze({
        format: "storyos-book",
        formatVersion: STORYOS_BOOK_FORMAT_VERSION,
        sourceBookId: book.id,
        databaseApplicationId: BOOK_DATABASE_APPLICATION_ID,
        databaseUserVersion: BOOK_DATABASE_SCHEMA_VERSION,
        title,
        exportedAt: new Date().toISOString(),
        applicationVersion: APP_VERSION,
      });
      const packageContent = createStoryOSBookPackage(manifest, readFileSync(snapshotPath));
      writeFileSync(temporaryOutput, packageContent, { flag: "wx" });
      readStoryOSBookPackage(readFileSync(temporaryOutput));
      this.files.publishExportFile(temporaryOutput, outputPath, request.overwrite === true);
    } finally {
      rmSync(temporaryOutput, { force: true });
      rmSync(workRoot, { recursive: true, force: true });
    }
  }

  importBook(request: ImportBookRequest): ImportBookResult {
    return this.writer.importBook(request);
  }

  private async renderExport(
    snapshot: BookExportSnapshot,
    format: BookTransferFormat,
    options: ExportBookOptions,
  ): Promise<Buffer> {
    return this.formats.export(format, snapshot, options);
  }
}
