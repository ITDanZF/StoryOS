import path from "node:path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import BookDatabase, {
  BOOK_DATABASE_APPLICATION_ID,
  BOOK_DATABASE_SCHEMA_VERSION,
} from "../storage/book/BookDatabase.ts";
import { getBookLayout } from "../storage/book/BookLayout.ts";
import SqliteNovelStore from "../storage/book/SqliteNovelStore.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";
import NovelApplication from "./NovelApplication.ts";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  serializeTiptapDocument,
} from "../../../shared/book/richText.ts";
import {
  MAX_STORYOS_BOOK_PACKAGE_BYTES,
  STORYOS_BOOK_FORMAT_VERSION,
  type ExportBookRequest,
  type ImportBookRequest,
  type ImportBookResult,
  type StoryOSBookManifest,
  type BookTransferFormat,
  type BookTransferFormatCapability,
  type CommitBookExportRequest,
  type CommitBookImportRequest,
  type ExportBookOptions,
  type ExportBookResult,
  type ExportPreview,
  type ImportPreview,
  type PrepareBookExportRequest,
  type PrepareBookImportRequest,
} from "./bookTransferContracts.ts";
import {
  createStoryOSBookPackage,
  readStoryOSBookPackage,
  sha256,
} from "./StoryOSBookPackage.ts";
import {
  detectBookTransferFormat,
  getBookTransferFormat,
  listBookTransferFormats,
} from "./book-transfer/BookTransferFormatRegistry.ts";
import type {
  BookExportSnapshot,
  PortableBookDraft,
} from "./book-transfer/PortableBook.ts";
import {
  chapterCharacterCount,
} from "./book-transfer/BookTextCodec.ts";
import { importTextBook, exportTextBook } from "./book-transfer/formats/TextBookAdapter.ts";
import { importMarkdownBook, exportMarkdownBook } from "./book-transfer/formats/MarkdownBookAdapter.ts";
import { importDocxBook, exportDocxBook } from "./book-transfer/formats/DocxBookAdapter.ts";
import { exportEpubBook } from "./book-transfer/formats/EpubBookAdapter.ts";
import { exportPdfBook } from "./book-transfer/formats/PdfBookAdapter.ts";

const APPLICATION_VERSION = "1.0.0";

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
  readonly snapshot: BookExportSnapshot;
  readonly format: BookTransferFormat;
  readonly options: ExportBookOptions;
  readonly preview: ExportPreview;
};

export default class BookTransferService {
  private readonly importSessions = new Map<string, ImportSession>();
  private readonly exportSessions = new Map<string, ExportSession>();

  constructor(
    private readonly agentHome: string,
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
  ) {}

  listFormats(): readonly BookTransferFormatCapability[] {
    return listBookTransferFormats();
  }

  async prepareImport(request: PrepareBookImportRequest): Promise<ImportPreview> {
    const filePath = this.requireImportPath(request.filePath);
    const format = detectBookTransferFormat(filePath);
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
    mkdirSync(rootPath, { recursive: true });
    try {
      copyFileSync(filePath, sourcePath);
      const content = readFileSync(sourcePath);
      const fingerprint = sha256(content);
      let native: ReturnType<typeof readStoryOSBookPackage> | undefined;
      let draft: PortableBookDraft | undefined;
      let preview: ImportPreview;
      if (format === "storyos") {
        native = readStoryOSBookPackage(content);
        this.validateNativePackage(native);
        const databasePath = path.join(rootPath, "preview.sqlite");
        writeFileSync(databasePath, native.database, { flag: "wx" });
        const snapshot = this.readSnapshotFromDatabase(databasePath, native.manifest.sourceBookId);
        preview = this.createImportPreview({
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
        if (format === "text") draft = importTextBook(content, filePath);
        else if (format === "markdown") draft = await importMarkdownBook(content, filePath);
        else draft = await importDocxBook(content, filePath);
        preview = this.createDraftPreview(sessionId, format, filePath, stats.size, fingerprint, draft);
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
      rmSync(rootPath, { recursive: true, force: true });
      throw error;
    }
  }

  async commitImport(request: CommitBookImportRequest): Promise<ImportBookResult> {
    const session = this.importSessions.get(request.sessionId);
    if (!session) throw new Error("Book import session has expired or was cancelled.");
    try {
      if (session.native) return this.importParsedNativeBook(session.native);
      if (!session.draft) throw new Error("Book import session contains no parsed draft.");
      return this.importPortableDraft(session.draft, session.fingerprint, session.format);
    } finally {
      this.importSessions.delete(session.sessionId);
      rmSync(session.rootPath, { recursive: true, force: true });
    }
  }

  cancelImport(sessionId: string): void {
    const session = this.importSessions.get(sessionId);
    if (!session) return;
    this.importSessions.delete(sessionId);
    rmSync(session.rootPath, { recursive: true, force: true });
  }

  prepareExport(request: PrepareBookExportRequest): ExportPreview {
    const capability = getBookTransferFormat(request.format);
    if (!capability.canExport) throw new Error(`Format cannot be exported: ${request.format}`);
    const snapshot = this.readBookSnapshot(request.bookId);
    const options = Object.freeze({ ...request.options });
    const extension = request.format === "markdown" && options.markdownBundle
      ? "zip"
      : capability.extensions[0];
    if (!extension) throw new Error(`Export format has no extension: ${request.format}`);
    const exportId = `book_export_preview_${crypto.randomUUID()}`;
    const preview: ExportPreview = Object.freeze({
      exportId,
      bookId: snapshot.bookId,
      title: snapshot.title,
      format: request.format,
      extension,
      suggestedFileName: `${this.safeFileName(snapshot.title)}.${extension}`,
      chapterCount: snapshot.volumes.reduce((total, volume) => total + volume.chapters.length, 0)
        + snapshot.ungroupedChapters.length,
      characterCount: snapshot.characterCount,
      warnings: Object.freeze(request.format === "storyos" ? [] : [{
        code: "revision-history-not-exported",
        message: "此格式只导出每章当前版本，不包含 StoryOS 修订历史和项目对话。",
        severity: "info" as const,
      }]),
    });
    this.exportSessions.set(exportId, Object.freeze({
      exportId,
      snapshot,
      format: request.format,
      options,
      preview,
    }));
    return preview;
  }

  async commitExport(request: CommitBookExportRequest): Promise<ExportBookResult> {
    const session = this.exportSessions.get(request.exportId);
    if (!session) throw new Error("Book export session has expired or was cancelled.");
    const outputPath = this.requireFormatOutputPath(request.outputPath, session.preview.extension);
    if (existsSync(outputPath)) throw new Error(`Export target already exists: ${outputPath}`);
    try {
      if (session.format === "storyos") {
        await this.exportBook({ bookId: session.snapshot.bookId, outputPath });
      } else {
        const content = await this.renderExport(session.snapshot, session.format, session.options);
        const temporary = path.join(
          path.dirname(outputPath),
          `.${path.basename(outputPath)}.${crypto.randomUUID()}.tmp`,
        );
        try {
          writeFileSync(temporary, content, { flag: "wx" });
          renameSync(temporary, outputPath);
        } finally {
          rmSync(temporary, { force: true });
        }
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
      this.exportSessions.delete(request.exportId);
    }
  }

  cancelExport(exportId: string): void {
    this.exportSessions.delete(exportId);
  }

  async exportBook(request: ExportBookRequest): Promise<void> {
    const book = this.books.getBookById(request.bookId);
    if (!book) throw new Error(`Book not found: ${request.bookId}`);
    if (book.state !== "available") {
      throw new Error(`Book storage is unavailable: ${book.id}`);
    }
    const outputPath = this.requirePackagePath(request.outputPath);
    if (existsSync(outputPath)) {
      throw new Error(`Export target already exists: ${outputPath}`);
    }
    const outputParent = path.dirname(outputPath);
    if (!existsSync(outputParent) || !statSync(outputParent).isDirectory()) {
      throw new Error(`Export directory does not exist: ${outputParent}`);
    }
    const operationId = `book_export_${crypto.randomUUID()}`;
    const workRoot = path.join(
      this.agentHome,
      "library",
      ".exporting",
      operationId,
    );
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
          new SqliteNovelStore(database.handle),
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
        applicationVersion: APPLICATION_VERSION,
      });
      const packageContent = createStoryOSBookPackage(
        manifest,
        readFileSync(snapshotPath),
      );
      writeFileSync(temporaryOutput, packageContent, { flag: "wx" });
      readStoryOSBookPackage(readFileSync(temporaryOutput));
      renameSync(temporaryOutput, outputPath);
    } finally {
      rmSync(temporaryOutput, { force: true });
      rmSync(workRoot, { recursive: true, force: true });
    }
  }

  importBook(request: ImportBookRequest): ImportBookResult {
    const packagePath = this.requirePackagePath(request.packagePath);
    if (!existsSync(packagePath) || !statSync(packagePath).isFile()) {
      throw new Error(`Book package does not exist: ${packagePath}`);
    }
    if (statSync(packagePath).size > MAX_STORYOS_BOOK_PACKAGE_BYTES) {
      throw new Error("StoryOS book package exceeds the maximum size.");
    }
    const parsed = readStoryOSBookPackage(readFileSync(packagePath));
    if (parsed.manifest.databaseApplicationId !== BOOK_DATABASE_APPLICATION_ID) {
      throw new Error("Book package contains the wrong database type.");
    }
    if (parsed.manifest.databaseUserVersion > BOOK_DATABASE_SCHEMA_VERSION) {
      throw new Error("Book package uses an unsupported future database version.");
    }

    const operationId = `book_import_${crypto.randomUUID()}`;
    const bookId = `book_${crypto.randomUUID()}`;
    const importingRoot = path.join(
      this.agentHome,
      "library",
      ".importing",
      operationId,
    );
    const importingDatabasePath = path.join(importingRoot, "book.sqlite");
    const finalLayout = getBookLayout(this.agentHome, bookId);
    mkdirSync(importingRoot, { recursive: true });
    let registered = false;
    let moved = false;
    try {
      writeFileSync(importingDatabasePath, parsed.database, { flag: "wx" });
      const database = new BookDatabase(importingDatabasePath);
      try {
        const novel = new NovelApplication(
          new SqliteNovelStore(database.handle),
        ).getProjectBook();
        if (!novel || novel.title !== parsed.manifest.title) {
          throw new Error("Book package title does not match its database.");
        }
      } finally {
        database.close();
      }
      BookDatabase.validateExisting(importingDatabasePath);
      this.books.registerImportedBook({
        id: bookId,
        storagePath: finalLayout.rootPath,
      });
      registered = true;
      mkdirSync(path.dirname(finalLayout.rootPath), { recursive: true });
      if (existsSync(finalLayout.rootPath)) {
        throw new Error(`Book storage path already exists: ${finalLayout.rootPath}`);
      }
      renameSync(importingRoot, finalLayout.rootPath);
      moved = true;
      this.books.updateStorageState(bookId, "available");
      return Object.freeze({
        operationId,
        bookId,
        sourceBookId: parsed.manifest.sourceBookId,
        title: parsed.manifest.title,
      });
    } catch (error) {
      if (registered) this.books.abandonImportedBook(bookId);
      if (moved) rmSync(finalLayout.rootPath, { recursive: true, force: true });
      throw error;
    } finally {
      rmSync(importingRoot, { recursive: true, force: true });
    }
  }

  private requireImportPath(value: string): string {
    const normalized = value?.trim();
    if (!normalized || !path.isAbsolute(normalized)) {
      throw new Error("Book import path must be absolute.");
    }
    const resolved = path.resolve(normalized);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      throw new Error(`Book import file does not exist: ${resolved}`);
    }
    return resolved;
  }

  private validateNativePackage(
    parsed: ReturnType<typeof readStoryOSBookPackage>,
  ): void {
    if (parsed.manifest.databaseApplicationId !== BOOK_DATABASE_APPLICATION_ID) {
      throw new Error("Book package contains the wrong database type.");
    }
    if (parsed.manifest.databaseUserVersion > BOOK_DATABASE_SCHEMA_VERSION) {
      throw new Error("Book package uses an unsupported future database version.");
    }
  }

  private importParsedNativeBook(
    parsed: ReturnType<typeof readStoryOSBookPackage>,
  ): ImportBookResult {
    this.validateNativePackage(parsed);
    const operationId = `book_import_${crypto.randomUUID()}`;
    const bookId = `book_${crypto.randomUUID()}`;
    const importingRoot = path.join(this.agentHome, "library", ".importing", operationId);
    const importingDatabasePath = path.join(importingRoot, "book.sqlite");
    const finalLayout = getBookLayout(this.agentHome, bookId);
    mkdirSync(importingRoot, { recursive: true });
    let registered = false;
    let moved = false;
    try {
      writeFileSync(importingDatabasePath, parsed.database, { flag: "wx" });
      BookDatabase.validateExisting(importingDatabasePath);
      const snapshot = this.readSnapshotFromDatabase(importingDatabasePath, bookId);
      if (snapshot.title !== parsed.manifest.title) {
        throw new Error("Book package title does not match its database.");
      }
      this.books.registerImportedBook({ id: bookId, storagePath: finalLayout.rootPath });
      registered = true;
      mkdirSync(path.dirname(finalLayout.rootPath), { recursive: true });
      if (existsSync(finalLayout.rootPath)) {
        throw new Error(`Book storage path already exists: ${finalLayout.rootPath}`);
      }
      renameSync(importingRoot, finalLayout.rootPath);
      moved = true;
      this.books.updateStorageState(bookId, "available");
      return Object.freeze({
        operationId,
        bookId,
        sourceBookId: parsed.manifest.sourceBookId,
        title: parsed.manifest.title,
        format: "storyos",
      });
    } catch (error) {
      if (registered) this.books.abandonImportedBook(bookId);
      if (moved) rmSync(finalLayout.rootPath, { recursive: true, force: true });
      throw error;
    } finally {
      rmSync(importingRoot, { recursive: true, force: true });
    }
  }

  private importPortableDraft(
    draft: PortableBookDraft,
    fingerprint: string,
    format: Exclude<BookTransferFormat, "epub" | "pdf">,
  ): ImportBookResult {
    const operationId = `book_import_${crypto.randomUUID()}`;
    const bookId = `book_${crypto.randomUUID()}`;
    const importingRoot = path.join(this.agentHome, "library", ".importing", operationId);
    const importingDatabasePath = path.join(importingRoot, "book.sqlite");
    const finalLayout = getBookLayout(this.agentHome, bookId);
    mkdirSync(importingRoot, { recursive: true });
    let registered = false;
    let moved = false;
    try {
      const database = new BookDatabase(importingDatabasePath);
      try {
        const novels = new NovelApplication(new SqliteNovelStore(database.handle));
        const novel = novels.createNovel({
          title: draft.title,
          synopsis: draft.synopsis,
          status: draft.status,
        });
        const createChapter = (
          chapter: PortableBookDraft["ungroupedChapters"][number],
          volumeId: string | null,
          sortOrder: number,
        ) => {
          const created = novels.createChapter({
            novelId: novel.id,
            volumeId,
            title: chapter.title,
            status: chapter.status,
            sortOrder,
          });
          const content = serializeTiptapDocument(chapter.document);
          novels.saveRevision({
            chapterId: created.id,
            content,
            characterCount: countTiptapCharacters(chapter.document),
            changeSummary: "从外部稿件导入",
            expectedCurrentRevisionId: null,
          });
        };
        draft.ungroupedChapters.forEach((chapter, index) => createChapter(chapter, null, index));
        draft.volumes.forEach((volume, volumeIndex) => {
          const createdVolume = novels.createVolume({
            novelId: novel.id,
            title: volume.title,
            summary: volume.summary,
            sortOrder: volumeIndex,
          });
          volume.chapters.forEach((chapter, index) => createChapter(chapter, createdVolume.id, index));
        });
      } finally {
        database.close();
      }
      BookDatabase.validateExisting(importingDatabasePath);
      this.books.registerImportedBook({ id: bookId, storagePath: finalLayout.rootPath });
      registered = true;
      mkdirSync(path.dirname(finalLayout.rootPath), { recursive: true });
      if (existsSync(finalLayout.rootPath)) throw new Error(`Book storage path already exists: ${finalLayout.rootPath}`);
      renameSync(importingRoot, finalLayout.rootPath);
      moved = true;
      this.books.updateStorageState(bookId, "available");
      return Object.freeze({
        operationId,
        bookId,
        sourceBookId: `external_${fingerprint.slice(0, 32)}`,
        title: draft.title,
        format,
      });
    } catch (error) {
      if (registered) this.books.abandonImportedBook(bookId);
      if (moved) rmSync(finalLayout.rootPath, { recursive: true, force: true });
      throw error;
    } finally {
      rmSync(importingRoot, { recursive: true, force: true });
    }
  }

  private readBookSnapshot(bookId: string): BookExportSnapshot {
    const lease = this.runtimes.acquire(bookId);
    try {
      const novels = new NovelApplication(lease.persistence);
      const novel = novels.getProjectBook();
      if (!novel) throw new Error(`Book contains no novel record: ${bookId}`);
      const volumes = novels.listVolumes(novel.id);
      const chapters = novels.listChapters(novel.id);
      const mapChapter = (chapter: (typeof chapters)[number]) => {
        const revision = novels.getCurrentRevision(chapter.id);
        const document = decodeStoredChapterContent(revision?.content ?? "");
        return Object.freeze({
          id: chapter.id,
          title: chapter.title,
          status: chapter.status,
          sortOrder: chapter.sortOrder,
          document,
          characterCount: revision?.characterCount ?? 0,
        });
      };
      const volumeSnapshots = volumes.map((volume) => Object.freeze({
        id: volume.id,
        title: volume.title,
        summary: volume.summary,
        sortOrder: volume.sortOrder,
        chapters: Object.freeze(chapters.filter((chapter) => chapter.volumeId === volume.id).map(mapChapter)),
      }));
      const ungroupedChapters = chapters.filter((chapter) => chapter.volumeId === null).map(mapChapter);
      return Object.freeze({
        bookId,
        title: novel.title,
        synopsis: novel.synopsis,
        status: novel.status,
        volumes: Object.freeze(volumeSnapshots),
        ungroupedChapters: Object.freeze(ungroupedChapters),
        characterCount: chapters.reduce((total, chapter) =>
          total + (novels.getCurrentRevision(chapter.id)?.characterCount ?? 0), 0),
      });
    } finally {
      lease.close();
    }
  }

  private readSnapshotFromDatabase(databasePath: string, bookId: string): BookExportSnapshot {
    BookDatabase.validateExisting(databasePath);
    const database = new BookDatabase(databasePath);
    try {
      const novels = new NovelApplication(new SqliteNovelStore(database.handle));
      const novel = novels.getProjectBook();
      if (!novel) throw new Error("Book database contains no novel record.");
      const volumes = novels.listVolumes(novel.id);
      const chapters = novels.listChapters(novel.id);
      const mapChapter = (chapter: (typeof chapters)[number]) => {
        const revision = novels.getCurrentRevision(chapter.id);
        const document = decodeStoredChapterContent(revision?.content ?? "");
        return Object.freeze({
          id: chapter.id,
          title: chapter.title,
          status: chapter.status,
          sortOrder: chapter.sortOrder,
          document,
          characterCount: revision?.characterCount ?? 0,
        });
      };
      return Object.freeze({
        bookId,
        title: novel.title,
        synopsis: novel.synopsis,
        status: novel.status,
        volumes: Object.freeze(volumes.map((volume) => Object.freeze({
          id: volume.id,
          title: volume.title,
          summary: volume.summary,
          sortOrder: volume.sortOrder,
          chapters: Object.freeze(chapters.filter((chapter) => chapter.volumeId === volume.id).map(mapChapter)),
        }))),
        ungroupedChapters: Object.freeze(chapters.filter((chapter) => chapter.volumeId === null).map(mapChapter)),
        characterCount: chapters.reduce((total, chapter) =>
          total + (novels.getCurrentRevision(chapter.id)?.characterCount ?? 0), 0),
      });
    } finally {
      database.close();
    }
  }

  private createImportPreview(input: {
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
    const toChapter = (chapter: BookExportSnapshot["ungroupedChapters"][number]) => Object.freeze({
      key: chapter.id,
      title: chapter.title,
      characterCount: chapter.characterCount,
    });
    const volumes = input.snapshot.volumes.map((volume) => Object.freeze({
      key: volume.id,
      title: volume.title,
      chapters: Object.freeze(volume.chapters.map(toChapter)),
    }));
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
      chapterCount: volumes.reduce((total, volume) => total + volume.chapters.length, 0) + ungroupedChapters.length,
      characterCount: input.snapshot.characterCount,
      includesRevisionHistory: input.includesRevisionHistory,
      sourceApplicationVersion: input.sourceApplicationVersion,
      sourceFormatVersion: input.sourceFormatVersion,
      exportedAt: input.exportedAt,
      warnings: Object.freeze(input.warnings),
    });
  }

  private createDraftPreview(
    sessionId: string,
    format: Exclude<BookTransferFormat, "epub" | "pdf">,
    filePath: string,
    fileSize: number,
    fingerprint: string,
    draft: PortableBookDraft,
  ): ImportPreview {
    const toChapter = (chapter: PortableBookDraft["ungroupedChapters"][number]) => Object.freeze({
      key: chapter.key,
      title: chapter.title,
      characterCount: chapterCharacterCount(chapter),
    });
    const volumes = draft.volumes.map((volume) => Object.freeze({
      key: volume.key,
      title: volume.title,
      chapters: Object.freeze(volume.chapters.map(toChapter)),
    }));
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
      chapterCount: volumes.reduce((total, volume) => total + volume.chapters.length, 0) + ungroupedChapters.length,
      characterCount: [...draft.ungroupedChapters, ...draft.volumes.flatMap((volume) => volume.chapters)]
        .reduce((total, chapter) => total + chapterCharacterCount(chapter), 0),
      includesRevisionHistory: false,
      sourceApplicationVersion: null,
      sourceFormatVersion: null,
      exportedAt: null,
      warnings: Object.freeze(draft.warnings),
    });
  }

  private async renderExport(
    snapshot: BookExportSnapshot,
    format: BookTransferFormat,
    options: ExportBookOptions,
  ): Promise<Buffer> {
    if (format === "text") return exportTextBook(snapshot, options);
    if (format === "docx") return exportDocxBook(snapshot, options);
    if (format === "epub") return exportEpubBook(snapshot, options);
    if (format === "pdf") return exportPdfBook(snapshot, options);
    if (format === "markdown") return (await exportMarkdownBook(snapshot, options)).content;
    throw new Error(`Unsupported external export format: ${format}`);
  }

  private requireFormatOutputPath(value: string, extension: string): string {
    const normalized = value?.trim();
    if (!normalized || !path.isAbsolute(normalized)) throw new Error("Book export path must be absolute.");
    const resolved = path.resolve(normalized);
    if (path.extname(resolved).toLocaleLowerCase("en-US") !== `.${extension.toLocaleLowerCase("en-US")}`) {
      throw new Error(`Book export path must use the .${extension} extension.`);
    }
    const parent = path.dirname(resolved);
    if (!existsSync(parent) || !statSync(parent).isDirectory()) {
      throw new Error(`Export directory does not exist: ${parent}`);
    }
    return resolved;
  }

  private safeFileName(value: string): string {
    const printable = Array.from(value.trim())
      .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
      .join("");
    return printable.replace(/[<>:"/\\|?*]/g, "-").replace(/[. ]+$/g, "").slice(0, 120) || "未命名书籍";
  }

  private requirePackagePath(value: string): string {
    const normalized = value.trim();
    if (!normalized || !path.isAbsolute(normalized)) {
      throw new Error("StoryOS book package path must be absolute.");
    }
    const resolved = path.resolve(normalized);
    if (path.extname(resolved).toLowerCase() !== ".storyos-book") {
      throw new Error("StoryOS book packages must use the .storyos-book extension.");
    }
    return resolved;
  }
}
