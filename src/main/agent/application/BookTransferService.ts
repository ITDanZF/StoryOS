import path from "node:path";
import {
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
  MAX_STORYOS_BOOK_PACKAGE_BYTES,
  STORYOS_BOOK_FORMAT_VERSION,
  type ExportBookRequest,
  type ImportBookRequest,
  type ImportBookResult,
  type StoryOSBookManifest,
} from "./bookTransferContracts.ts";
import {
  createStoryOSBookPackage,
  readStoryOSBookPackage,
} from "./StoryOSBookPackage.ts";

const APPLICATION_VERSION = "1.0.0";

export default class BookTransferService {
  constructor(
    private readonly agentHome: string,
    private readonly books: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
  ) {}

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
