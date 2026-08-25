import path from "node:path";
import { existsSync, rmSync } from "node:fs";
import type { BookRegistry } from "../../application/bookRegistryPorts.ts";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  NovelPersistence,
  NovelRecord,
  VolumeRecord,
} from "../../application/novelPorts.ts";
import BookDatabase from "./BookDatabase.ts";
import { ensureBookLayout, getBookLayout } from "./BookLayout.ts";
import SqliteNovelStore from "./SqliteNovelStore.ts";

function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export default class ProjectBookNovelStore implements NovelPersistence {
  private database: BookDatabase | null = null;
  private delegate: SqliteNovelStore | null = null;

  constructor(
    private readonly projectId: string | null,
    private readonly agentHome: string,
    private readonly registry: BookRegistry,
  ) {
    const book = projectId ? registry.getBookForProject(projectId) : null;
    if (!book) return;
    if (book.state !== "available") {
      throw new Error(`Project book storage is unavailable: ${book.id}`);
    }
    const layout = getBookLayout(agentHome, book.id);
    if (!samePath(book.storagePath, layout.rootPath)) {
      throw new Error(`Invalid registered book path: ${book.storagePath}`);
    }
    if (!existsSync(layout.databasePath)) {
      throw new Error(`Book database does not exist: ${layout.databasePath}`);
    }
    this.open(layout.databasePath);
  }

  close(): void {
    this.delegate = null;
    this.database?.close();
    this.database = null;
  }

  createNovel(
    input: Omit<NovelRecord, "createdAt" | "updatedAt">,
  ): NovelRecord {
    if (this.delegate) return this.delegate.createNovel(input);
    if (!this.projectId) {
      throw new Error("A project is required to create a book.");
    }

    const bookId = `book_${crypto.randomUUID()}`;
    const layout = ensureBookLayout(this.agentHome, bookId);
    const database = new BookDatabase(layout.databasePath);
    const store = new SqliteNovelStore(database.handle);
    try {
      const novel = store.createNovel(input);
      this.registry.registerBookForProject({
        id: bookId,
        projectId: this.projectId,
        storagePath: layout.rootPath,
      });
      this.database = database;
      this.delegate = store;
      return novel;
    } catch (error) {
      database.close();
      rmSync(layout.rootPath, { recursive: true, force: true });
      throw error;
    }
  }

  getNovel(novelId: string): NovelRecord | null {
    return this.delegate?.getNovel(novelId) ?? null;
  }

  listNovels(): NovelRecord[] {
    return this.delegate?.listNovels() ?? [];
  }

  updateNovel(
    input: Pick<NovelRecord, "id" | "title" | "synopsis" | "status">,
  ): NovelRecord {
    return this.requireStore().updateNovel(input);
  }

  deleteNovel(novelId: string): void {
    this.requireStore().deleteNovel(novelId);
  }

  createVolume(
    input: Omit<VolumeRecord, "createdAt" | "updatedAt">,
  ): VolumeRecord {
    return this.requireStore().createVolume(input);
  }

  listVolumes(novelId: string): VolumeRecord[] {
    return this.requireStore().listVolumes(novelId);
  }

  updateVolume(
    input: Pick<VolumeRecord, "id" | "title" | "summary" | "sortOrder">,
  ): VolumeRecord {
    return this.requireStore().updateVolume(input);
  }

  deleteVolume(volumeId: string): void {
    this.requireStore().deleteVolume(volumeId);
  }

  createChapter(
    input: Omit<
      ChapterRecord,
      "currentRevisionId" | "createdAt" | "updatedAt"
    >,
  ): ChapterRecord {
    return this.requireStore().createChapter(input);
  }

  getChapter(chapterId: string): ChapterRecord | null {
    return this.delegate?.getChapter(chapterId) ?? null;
  }

  listChapters(novelId: string): ChapterRecord[] {
    return this.requireStore().listChapters(novelId);
  }

  updateChapter(
    input: Pick<
      ChapterRecord,
      "id" | "volumeId" | "title" | "status" | "sortOrder"
    >,
  ): ChapterRecord {
    return this.requireStore().updateChapter(input);
  }

  deleteChapter(chapterId: string): void {
    this.requireStore().deleteChapter(chapterId);
  }

  saveRevision(
    input: Omit<
      ChapterRevisionRecord,
      "revisionNumber" | "createdAt"
    > & { readonly expectedCurrentRevisionId: string | null },
  ): ChapterRevisionRecord {
    return this.requireStore().saveRevision(input);
  }

  getRevision(revisionId: string): ChapterRevisionRecord | null {
    return this.delegate?.getRevision(revisionId) ?? null;
  }

  listRevisions(chapterId: string): ChapterRevisionRecord[] {
    return this.requireStore().listRevisions(chapterId);
  }

  private open(databasePath: string): void {
    const database = new BookDatabase(databasePath);
    this.database = database;
    this.delegate = new SqliteNovelStore(database.handle);
  }

  private requireStore(): SqliteNovelStore {
    if (!this.delegate) {
      throw new Error(`Project book not found: ${this.projectId ?? "global"}`);
    }
    return this.delegate;
  }
}
