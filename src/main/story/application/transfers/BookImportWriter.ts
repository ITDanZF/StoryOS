import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  countTiptapCharacters,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import type { BookRegistry } from "../books/bookRegistryPorts.ts";
import NovelApplication from "../books/NovelApplication.ts";
import BookDatabase, {
  BOOK_DATABASE_APPLICATION_ID,
  BOOK_DATABASE_SCHEMA_VERSION,
} from "../../storage/book/BookDatabase.ts";
import { getBookLayout } from "../../storage/book/BookLayout.ts";
import SqliteNovelStore from "../../storage/book/SqliteNovelStore.ts";
import BookExportSnapshotReader from "./BookExportSnapshotReader.ts";
import {
  MAX_STORYOS_BOOK_PACKAGE_BYTES,
  type BookTransferFormat,
  type ImportBookRequest,
  type ImportBookResult,
} from "./bookTransferContracts.ts";
import ExportFilePublisher from "./ExportFilePublisher.ts";
import type { PortableBookDraft } from "./PortableBook.ts";
import { readStoryOSBookPackage } from "./StoryOSBookPackage.ts";
export default class BookImportWriter {
  constructor(
    private readonly agentHome: string,
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
    private readonly snapshots: BookExportSnapshotReader,
    private readonly files: ExportFilePublisher,
  ) {}
  importBook(request: ImportBookRequest): ImportBookResult {
    const packagePath = this.files.requirePackagePath(request.packagePath);
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
    const importingRoot = path.join(this.agentHome, "library", ".importing", operationId);
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
          new SqliteNovelStore(database.handle, this.runtimes.deviceId),
        ).getProjectBook();
        if (!novel || novel.title !== parsed.manifest.title) {
          throw new Error("Book package title does not match its database.");
        }
      } finally {
        database.close();
      }
      BookDatabase.validateExisting(importingDatabasePath);
      BookDatabase.identifyCopy(importingDatabasePath, bookId);
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

  validateNativePackage(parsed: ReturnType<typeof readStoryOSBookPackage>): void {
    if (parsed.manifest.databaseApplicationId !== BOOK_DATABASE_APPLICATION_ID) {
      throw new Error("Book package contains the wrong database type.");
    }
    if (parsed.manifest.databaseUserVersion > BOOK_DATABASE_SCHEMA_VERSION) {
      throw new Error("Book package uses an unsupported future database version.");
    }
  }

  importParsedNativeBook(parsed: ReturnType<typeof readStoryOSBookPackage>): ImportBookResult {
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
      BookDatabase.identifyCopy(importingDatabasePath, bookId);
      const snapshot = this.snapshots.readSnapshotFromDatabase(importingDatabasePath, bookId);
      if (snapshot.title !== parsed.manifest.title) {
        throw new Error("Book package title does not match its database.");
      }
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

  importPortableDraft(
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
        const novels = new NovelApplication(
          new SqliteNovelStore(database.handle, this.runtimes.deviceId),
        );
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
            origin: "import",
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
          volume.chapters.forEach((chapter, index) =>
            createChapter(chapter, createdVolume.id, index),
          );
        });
      } finally {
        database.close();
      }
      BookDatabase.validateExisting(importingDatabasePath);
      BookDatabase.identifyCopy(importingDatabasePath, bookId);
      this.books.registerImportedBook({
        id: bookId,
        storagePath: finalLayout.rootPath,
      });
      registered = true;
      mkdirSync(path.dirname(finalLayout.rootPath), { recursive: true });
      if (existsSync(finalLayout.rootPath))
        throw new Error(`Book storage path already exists: ${finalLayout.rootPath}`);
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
}
