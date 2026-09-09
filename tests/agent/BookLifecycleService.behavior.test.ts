import BookCatalogProjection from "../../src/main/story/storage/global/BookCatalogProjection.ts";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookLifecycleService from "../../src/main/story/application/books/BookLifecycleService.ts";
import BookProvisioningService from "../../src/main/story/application/books/BookProvisioningService.ts";
import BookRegistryReconciler from "../../src/main/story/application/books/BookRegistryReconciler.ts";
import ProjectApplication from "../../src/main/story/application/projects/ProjectApplication.ts";
import BookRuntimeManager from "../../src/main/story/runtime/BookRuntimeManager.ts";
import { getBookLayout } from "../../src/main/story/storage/book/BookLayout.ts";
import ApplicationDatabase from "../../src/main/story/storage/global/ApplicationDatabase.ts";
import SqliteBookStore from "../../src/main/story/storage/global/SqliteBookStore.ts";
import SqliteProjectStore from "../../src/main/story/storage/global/SqliteProjectStore.ts";

const roots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-book-lifecycle-"));
  roots.push(root);
  const agentHome = path.join(root, ".mini-agent");
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  mkdirSync(path.join(agentHome, "workSpaceRoot"), { recursive: true });
  writeFileSync(
    path.join(agentHome, "config.json"),
    JSON.stringify({ AGENT_WORKSPACE: "" }),
    "utf8",
  );
  const database = new ApplicationDatabase(agentHome);
  const projects = new ProjectApplication(new SqliteProjectStore(database.handle));
  const books = new SqliteBookStore(database.handle);
  const runtimes = new BookRuntimeManager(
    agentHome,
    books,
    new BookCatalogProjection(database.handle),
  );
  const provisioning = new BookProvisioningService(agentHome, books, runtimes);
  const reconciler = new BookRegistryReconciler(books, runtimes);
  const lifecycle = new BookLifecycleService(agentHome, books, runtimes);
  const parentPath = path.join(root, "projects");
  mkdirSync(parentPath);
  return {
    agentHome,
    books,
    database,
    lifecycle,
    parentPath,
    projects,
    provisioning,
    reconciler,
    runtimes,
  };
}

function provisionBook(harness: ReturnType<typeof createHarness>, name: string) {
  const project = harness.projects.createProject({
    name,
    parentPath: harness.parentPath,
  });
  const provisioned = harness.provisioning.createForProject(project.id, {
    id: `novel_${crypto.randomUUID()}`,
    title: `${name} book`,
    synopsis: "",
    status: "planning",
  });
  return { project, provisioned };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("BookLifecycleService behavior", () => {
  it("reconciles available, missing, and corrupted registrations independently", () => {
    const harness = createHarness();
    const healthy = provisionBook(harness, "Healthy");
    healthy.provisioned.lease.close();
    const missing = provisionBook(harness, "Missing");
    missing.provisioned.lease.close();
    const corrupted = provisionBook(harness, "Corrupted");
    corrupted.provisioned.lease.close();
    rmSync(getBookLayout(harness.agentHome, missing.provisioned.bookId).databasePath);
    writeFileSync(getBookLayout(harness.agentHome, corrupted.provisioned.bookId).databasePath, "");

    const results = harness.reconciler.reconcile();

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookId: healthy.provisioned.bookId,
          state: "available",
          changed: false,
        }),
        expect.objectContaining({
          bookId: missing.provisioned.bookId,
          state: "missing",
          changed: true,
        }),
        expect.objectContaining({
          bookId: corrupted.provisioned.bookId,
          state: "corrupted",
          changed: true,
        }),
      ]),
    );
    expect(harness.books.getBookById(missing.provisioned.bookId)?.state).toBe("missing");
    expect(harness.books.getBookById(corrupted.provisioned.bookId)?.state).toBe("corrupted");
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("moves an unlinked book to logical trash and restores it without data loss", () => {
    const harness = createHarness();
    const { project, provisioned } = provisionBook(harness, "Trash restore");
    provisioned.lease.close();
    harness.books.detachBook(project.id);
    const databasePath = getBookLayout(harness.agentHome, provisioned.bookId).databasePath;

    const trashed = harness.lifecycle.moveToTrash(provisioned.bookId);

    expect(trashed).toEqual(
      expect.objectContaining({
        bookId: provisioned.bookId,
        title: "Trash restore book",
      }),
    );
    expect(harness.books.getBookById(provisioned.bookId)?.state).toBe("trashed");
    expect(harness.books.listTrash()).toEqual([
      expect.objectContaining({
        bookId: provisioned.bookId,
        title: "Trash restore book",
      }),
    ]);
    expect(() => harness.runtimes.acquire(provisioned.bookId)).toThrow("storage is unavailable");
    expect(existsSync(databasePath)).toBe(true);

    const restored = harness.lifecycle.restoreFromTrash(provisioned.bookId);

    expect(restored.state).toBe("available");
    const lease = harness.runtimes.acquire(provisioned.bookId);
    lease.close();
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("refuses lifecycle deletion while a book is linked or in use", () => {
    const harness = createHarness();
    const { project, provisioned } = provisionBook(harness, "Protected");

    expect(() => harness.lifecycle.moveToTrash(provisioned.bookId)).toThrow(
      "still attached to a project",
    );
    harness.books.detachBook(project.id);
    expect(() => harness.lifecycle.moveToTrash(provisioned.bookId)).toThrow(
      "runtime is still in use",
    );

    provisioned.lease.close();
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("requires exact confirmation and permanently deletes only an unlinked book", () => {
    const harness = createHarness();
    const { project, provisioned } = provisionBook(harness, "Permanent");
    provisioned.lease.close();
    harness.books.detachBook(project.id);
    const layout = getBookLayout(harness.agentHome, provisioned.bookId);

    expect(() =>
      harness.lifecycle.permanentlyDelete({
        bookId: provisioned.bookId,
        confirmationBookId: "book_wrong",
      }),
    ).toThrow("exact book id");

    expect(() =>
      harness.lifecycle.permanentlyDelete({
        bookId: provisioned.bookId,
        confirmationBookId: provisioned.bookId,
      }),
    ).toThrow("Only trashed books");

    harness.lifecycle.moveToTrash(provisioned.bookId);
    harness.lifecycle.permanentlyDelete({
      bookId: provisioned.bookId,
      confirmationBookId: provisioned.bookId,
    });

    expect(harness.books.getBookById(provisioned.bookId)).toBeNull();
    expect(
      harness.database.handle
        .prepare(
          `
      SELECT book_id, cleanup_state
      FROM book_cleanup_details
      WHERE book_id = ?
    `,
        )
        .get(provisioned.bookId),
    ).toEqual({
      book_id: provisioned.bookId,
      cleanup_state: "completed",
    });
    expect(() => harness.runtimes.inspectStorage(provisioned.bookId)).toThrow("Book not found");
    expect(existsSync(layout.rootPath)).toBe(false);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("restores a trashed book to its actual missing state", () => {
    const harness = createHarness();
    const { project, provisioned } = provisionBook(harness, "Missing restore");
    provisioned.lease.close();
    harness.books.detachBook(project.id);
    harness.lifecycle.moveToTrash(provisioned.bookId);
    rmSync(getBookLayout(harness.agentHome, provisioned.bookId).databasePath);

    const restored = harness.lifecycle.restoreFromTrash(provisioned.bookId);

    expect(restored.state).toBe("missing");
    harness.runtimes.closeAll();
    harness.database.close();
  });
});
