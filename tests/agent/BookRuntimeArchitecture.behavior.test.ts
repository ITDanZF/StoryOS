import BookCatalogProjection from "../../src/main/story/storage/global/BookCatalogProjection.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookProvisioningService from "../../src/main/story/application/books/BookProvisioningService.ts";
import BookshelfApplication from "../../src/main/story/application/books/BookshelfApplication.ts";
import NovelApplication from "../../src/main/story/application/books/NovelApplication.ts";
import ProjectApplication from "../../src/main/story/application/projects/ProjectApplication.ts";
import type ProjectBookBindingService from "../../src/main/story/application/projects/ProjectBookBindingService.ts";
import type BookRegistryReconciler from "../../src/main/story/application/books/BookRegistryReconciler.ts";
import type BookLifecycleService from "../../src/main/story/application/books/BookLifecycleService.ts";
import type BookTransferService from "../../src/main/story/application/transfers/BookTransferService.ts";
import type ProjectArchiveService from "../../src/main/story/application/projects/ProjectArchiveService.ts";
import BookRuntimeManager from "../../src/main/story/runtime/BookRuntimeManager.ts";
import ApplicationDatabase from "../../src/main/story/storage/global/ApplicationDatabase.ts";
import SqliteBookStore from "../../src/main/story/storage/global/SqliteBookStore.ts";
import SqliteProjectStore from "../../src/main/story/storage/global/SqliteProjectStore.ts";
import { getBookLayout } from "../../src/main/story/storage/book/BookLayout.ts";

const roots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-book-runtime-"));
  roots.push(root);
  const agentHome = path.join(root, ".mini-agent");
  mkdirSync(path.join(agentHome, "workSpaceRoot"), { recursive: true });
  writeFileSync(
    path.join(agentHome, "config.json"),
    JSON.stringify({ AGENT_WORKSPACE: "" }),
    "utf8",
  );
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  const database = new ApplicationDatabase(agentHome);
  const projects = new ProjectApplication(new SqliteProjectStore(database.handle));
  const books = new SqliteBookStore(database.handle);
  const runtimes = new BookRuntimeManager(
    agentHome,
    books,
    new BookCatalogProjection(database.handle),
  );
  const provisioning = new BookProvisioningService(agentHome, books, runtimes);
  const bindings = {
    attachExistingBook: vi.fn(),
    detachBook: vi.fn(),
  } as unknown as ProjectBookBindingService;
  const reconciler = { reconcile: vi.fn() } as unknown as BookRegistryReconciler;
  const lifecycle = {} as BookLifecycleService;
  const transfer = {} as BookTransferService;
  const projectArchives = {} as ProjectArchiveService;
  const bookshelf = new BookshelfApplication(
    books,
    runtimes,
    bindings,
    reconciler,
    lifecycle,
    transfer,
    projectArchives,
    provisioning,
  );
  const parentPath = path.join(root, "projects");
  mkdirSync(parentPath);
  return {
    agentHome,
    books,
    bookshelf,
    database,
    parentPath,
    projects,
    provisioning,
    runtimes,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("book runtime architecture", () => {
  it("returns an empty catalog when no books are registered", () => {
    const harness = createHarness();

    expect(harness.bookshelf.listBooks()).toEqual([]);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("keeps a book openable after its project record is removed", () => {
    const harness = createHarness();
    const project = harness.projects.createProject({
      name: "Original project",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(project.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Persistent book",
      synopsis: "",
      status: "planning",
    });
    const bookId = provisioned.bookId;
    provisioned.lease.close();

    harness.projects.removeProject(project.path);

    expect(harness.books.getBookForProject(project.id)).toBeNull();
    const lease = harness.runtimes.acquire(bookId);
    expect(new NovelApplication(lease.persistence).getProjectBook()?.title).toBe("Persistent book");
    lease.close();
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("reads an unbound book without requiring a project runtime", () => {
    const harness = createHarness();
    const original = harness.projects.createProject({
      name: "Original",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(original.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Attachable book",
      synopsis: "",
      status: "writing",
    });
    provisioned.lease.close();
    harness.books.detachBook(original.id);
    expect(harness.bookshelf.listBooks()).toEqual([
      expect.objectContaining({
        availability: "ready",
        bookId: provisioned.bookId,
        title: "Attachable book",
        linkedProjectCount: 0,
      }),
    ]);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("returns the documented title and book statistics", () => {
    const harness = createHarness();
    const project = harness.projects.createProject({
      name: "Statistics",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(project.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Statistics book",
      synopsis: "",
      status: "writing",
    });
    const novels = new NovelApplication(provisioned.lease.persistence);
    const novel = novels.getProjectBook();
    if (!novel) throw new Error("Provisioned novel is missing.");
    const volume = novels.createVolume({
      novelId: novel.id,
      title: "Volume one",
      sortOrder: 0,
    });
    const chapter = novels.createChapter({
      novelId: novel.id,
      volumeId: volume.id,
      title: "Chapter one",
      sortOrder: 0,
    });
    novels.saveRevision({
      chapterId: chapter.id,
      content: "hello",
      expectedCurrentRevisionId: null,
    });
    provisioned.lease.close();

    expect(harness.bookshelf.listBooks()).toEqual([
      expect.objectContaining({
        availability: "ready",
        bookId: provisioned.bookId,
        title: "Statistics book",
        synopsis: "",
        status: "writing",
        storageState: "available",
        volumeCount: 1,
        chapterCount: 1,
        characterCount: 5,
        linkedProjectId: project.id,
        linkedProjectCount: 1,
      }),
    ]);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("creates an independent book without a project binding", () => {
    const harness = createHarness();
    const created = harness.bookshelf.createBook({
      title: "Standalone book",
      synopsis: "Independent story asset",
    });

    expect(created.book).toEqual(
      expect.objectContaining({
        availability: "ready",
        bookId: created.bookId,
        title: "Standalone book",
        synopsis: "Independent story asset",
        status: "planning",
        linkedProjectId: null,
        linkedProjectCount: 0,
        lastOpenedAt: null,
      }),
    );
    expect(harness.books.getBookById(created.bookId)?.state).toBe("available");
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("does not change last opened time while reading the catalog", () => {
    const harness = createHarness();
    const project = harness.projects.createProject({
      name: "Read-only catalog",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(project.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Untouched recency",
      synopsis: "",
      status: "planning",
    });
    provisioned.lease.close();
    harness.database.handle
      .prepare("UPDATE book_registry SET last_opened_at = ? WHERE book_id = ?")
      .run(1_000, provisioned.bookId);

    harness.bookshelf.listBooks();

    expect(harness.books.getBookById(provisioned.bookId)?.lastOpenedAt).toEqual(new Date(1_000));
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("rejects a registered storage path outside the managed book library", () => {
    const harness = createHarness();
    const project = harness.projects.createProject({
      name: "Invalid path",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(project.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Path check",
      synopsis: "",
      status: "planning",
    });
    provisioned.lease.close();
    harness.database.handle
      .prepare("UPDATE book_registry SET local_path = ?, path_key = ? WHERE book_id = ?")
      .run(harness.parentPath, harness.parentPath, provisioned.bookId);

    expect(() => harness.runtimes.acquire(provisioned.bookId)).toThrow(
      "Invalid registered book path",
    );
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("reports a missing database without failing the catalog query", () => {
    const harness = createHarness();
    const project = harness.projects.createProject({
      name: "Missing database",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(project.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Missing book",
      synopsis: "",
      status: "planning",
    });
    provisioned.lease.close();
    rmSync(getBookLayout(harness.agentHome, provisioned.bookId).databasePath);

    expect(harness.bookshelf.listBooks()).toEqual([
      expect.objectContaining({
        bookId: provisioned.bookId,
        availability: "unavailable",
        storageState: "missing",
      }),
    ]);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("isolates a corrupted database from other catalog books", () => {
    const harness = createHarness();
    const firstProject = harness.projects.createProject({
      name: "Healthy database",
      parentPath: harness.parentPath,
    });
    const healthy = harness.provisioning.createForProject(firstProject.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Healthy book",
      synopsis: "",
      status: "writing",
    });
    healthy.lease.close();
    const secondProject = harness.projects.createProject({
      name: "Corrupted database",
      parentPath: harness.parentPath,
    });
    const corrupted = harness.provisioning.createForProject(secondProject.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Corrupted book",
      synopsis: "",
      status: "planning",
    });
    corrupted.lease.close();
    writeFileSync(getBookLayout(harness.agentHome, corrupted.bookId).databasePath, "");

    const catalog = harness.bookshelf.listBooks();

    expect(catalog).toHaveLength(2);
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookId: healthy.bookId,
          availability: "ready",
          title: "Healthy book",
        }),
        expect.objectContaining({
          bookId: corrupted.bookId,
          availability: "unavailable",
          storageState: "corrupted",
        }),
      ]),
    );
    harness.runtimes.closeAll();
    harness.database.close();
  });
});
