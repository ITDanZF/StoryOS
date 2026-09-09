import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookProvisioningService from "../../src/main/story/application/books/BookProvisioningService.ts";
import ProjectApplication from "../../src/main/story/application/projects/ProjectApplication.ts";
import ProjectBookBindingService from "../../src/main/story/application/projects/ProjectBookBindingService.ts";
import BookRuntimeManager from "../../src/main/story/runtime/BookRuntimeManager.ts";
import type WorkspaceRuntimeManager from "../../src/main/story/runtime/WorkspaceRuntimeManager.ts";
import { getBookLayout } from "../../src/main/story/storage/book/BookLayout.ts";
import ApplicationDatabase from "../../src/main/story/storage/global/ApplicationDatabase.ts";
import SqliteBookStore from "../../src/main/story/storage/global/SqliteBookStore.ts";
import SqliteProjectStore from "../../src/main/story/storage/global/SqliteProjectStore.ts";

const roots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-book-binding-"));
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
  const bookRuntimes = new BookRuntimeManager(agentHome, books);
  const provisioning = new BookProvisioningService(agentHome, books, bookRuntimes);
  const parentPath = path.join(root, "projects");
  mkdirSync(parentPath);
  return {
    agentHome,
    bookRuntimes,
    books,
    database,
    parentPath,
    projects,
    provisioning,
  };
}

function createCoordinator(activeProjectPath: string | null = null) {
  return {
    activeProjectPath,
    closeForProjectMutation: vi.fn(async () => undefined),
    activate: vi.fn(async () => undefined),
  } as unknown as Pick<
    WorkspaceRuntimeManager,
    "activeProjectPath" | "closeForProjectMutation" | "activate"
  >;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ProjectBookBindingService behavior", () => {
  it("attaches, rebuilds, detaches, and reopens an active empty project", async () => {
    const harness = createHarness();
    const source = harness.projects.createProject({
      name: "Source",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(source.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Reusable book",
      synopsis: "",
      status: "writing",
    });
    provisioned.lease.close();
    harness.books.detachBook(source.id);
    const target = harness.projects.createProject({
      name: "Target",
      parentPath: harness.parentPath,
    });
    const coordinator = createCoordinator(target.path);
    const bindings = new ProjectBookBindingService(
      harness.projects,
      harness.books,
      harness.bookRuntimes,
      coordinator,
    );

    await bindings.attachExistingBook(target.id, provisioned.bookId);

    expect(harness.books.getBookForProject(target.id)?.id).toBe(provisioned.bookId);
    expect(coordinator.closeForProjectMutation).toHaveBeenCalledWith(target.path);
    expect(coordinator.activate).toHaveBeenCalledWith(target.path);

    await bindings.detachBook(target.id);

    expect(harness.books.getBookForProject(target.id)).toBeNull();
    expect(coordinator.closeForProjectMutation).toHaveBeenCalledTimes(2);
    expect(coordinator.activate).toHaveBeenCalledTimes(2);
    harness.bookRuntimes.closeAll();
    harness.database.close();
  });

  it("enforces one writable project for each book", async () => {
    const harness = createHarness();
    const source = harness.projects.createProject({
      name: "Writer one",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(source.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Single writer",
      synopsis: "",
      status: "planning",
    });
    provisioned.lease.close();
    const target = harness.projects.createProject({
      name: "Writer two",
      parentPath: harness.parentPath,
    });
    const bindings = new ProjectBookBindingService(
      harness.projects,
      harness.books,
      harness.bookRuntimes,
      createCoordinator(),
    );

    await expect(bindings.attachExistingBook(target.id, provisioned.bookId)).rejects.toThrow(
      "already attached to a writable project",
    );
    expect(() =>
      harness.books.attachExistingBook({
        projectId: target.id,
        bookId: provisioned.bookId,
      }),
    ).toThrow("already attached to a writable project");
    expect(harness.books.getBookForProject(target.id)).toBeNull();
    harness.bookRuntimes.closeAll();
    harness.database.close();
  });

  it("does not create an association when the book database is missing", async () => {
    const harness = createHarness();
    const source = harness.projects.createProject({
      name: "Missing source",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(source.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Missing book",
      synopsis: "",
      status: "planning",
    });
    provisioned.lease.close();
    harness.books.detachBook(source.id);
    rmSync(getBookLayout(harness.agentHome, provisioned.bookId).databasePath);
    const target = harness.projects.createProject({
      name: "Missing target",
      parentPath: harness.parentPath,
    });
    const bindings = new ProjectBookBindingService(
      harness.projects,
      harness.books,
      harness.bookRuntimes,
      createCoordinator(target.path),
    );

    await expect(bindings.attachExistingBook(target.id, provisioned.bookId)).rejects.toThrow(
      "does not exist",
    );
    expect(harness.books.getBookForProject(target.id)).toBeNull();
    harness.bookRuntimes.closeAll();
    harness.database.close();
  });

  it("removes the new association when runtime rebuilding fails", async () => {
    const harness = createHarness();
    const source = harness.projects.createProject({
      name: "Recovery source",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(source.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Recovery book",
      synopsis: "",
      status: "planning",
    });
    provisioned.lease.close();
    harness.books.detachBook(source.id);
    const target = harness.projects.createProject({
      name: "Recovery target",
      parentPath: harness.parentPath,
    });
    const coordinator = createCoordinator(target.path);
    vi.mocked(coordinator.activate)
      .mockRejectedValueOnce(new Error("runtime failed"))
      .mockResolvedValueOnce(undefined);
    const bindings = new ProjectBookBindingService(
      harness.projects,
      harness.books,
      harness.bookRuntimes,
      coordinator,
    );

    await expect(bindings.attachExistingBook(target.id, provisioned.bookId)).rejects.toThrow(
      "runtime failed",
    );
    expect(harness.books.getBookForProject(target.id)).toBeNull();
    expect(coordinator.activate).toHaveBeenCalledTimes(2);
    harness.bookRuntimes.closeAll();
    harness.database.close();
  });

  it("keeps the same book identity after project rename and runtime restart", async () => {
    const harness = createHarness();
    const source = harness.projects.createProject({
      name: "Rename source",
      parentPath: harness.parentPath,
    });
    const provisioned = harness.provisioning.createForProject(source.id, {
      id: `novel_${crypto.randomUUID()}`,
      title: "Stable identity",
      synopsis: "",
      status: "writing",
    });
    provisioned.lease.close();
    const storagePath = harness.books.getBookById(provisioned.bookId)?.storagePath;

    const renamed = harness.projects.renameProject({
      projectPath: source.path,
      name: "Renamed project",
    }).project;
    harness.bookRuntimes.closeAll();
    const reopenedRuntimes = new BookRuntimeManager(harness.agentHome, harness.books);
    const lease = reopenedRuntimes.acquire(provisioned.bookId);

    expect(harness.books.getBookForProject(renamed.id)?.id).toBe(provisioned.bookId);
    expect(lease.book.storagePath).toBe(storagePath);
    lease.close();
    reopenedRuntimes.closeAll();
    harness.database.close();
  });
});
