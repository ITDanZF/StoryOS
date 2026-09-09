import { markOperationDirectory } from "../../src/main/story/storage/common/operationOwnership.ts";
import BookDatabase from "../../src/main/story/storage/book/BookDatabase.ts";
import {
  serializeTiptapDocument as canonicalDoc,
  plainTextToTiptapDocument as textDoc,
} from "../../src/shared/book/richText.ts";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookProvisioningService from "../../src/main/story/application/books/BookProvisioningService.ts";
import NovelApplication from "../../src/main/story/application/books/NovelApplication.ts";
import ProjectApplication from "../../src/main/story/application/projects/ProjectApplication.ts";
import ProjectArchiveService from "../../src/main/story/application/projects/ProjectArchiveService.ts";
import ThreadApplication from "../../src/main/story/application/conversations/ThreadApplication.ts";
import BookRuntimeManager from "../../src/main/story/runtime/BookRuntimeManager.ts";
import ApplicationDatabase from "../../src/main/story/storage/global/ApplicationDatabase.ts";
import SqliteBookStore from "../../src/main/story/storage/global/SqliteBookStore.ts";
import SqliteProjectArchiveStore from "../../src/main/story/storage/global/SqliteProjectArchiveStore.ts";
import SqliteProjectStore from "../../src/main/story/storage/global/SqliteProjectStore.ts";
import ProjectDatabase from "../../src/main/story/storage/project/ProjectDatabase.ts";
import SqliteThreadStore from "../../src/main/story/storage/project/SqliteThreadStore.ts";
import { getWorkspaceLayout } from "../../src/main/story/workspace/ProjectLayout.ts";
import { copyProjectDirectory } from "../../src/main/story/application/projects/ProjectArchivePackage.ts";
import { getProjectArchiveLayout } from "../../src/main/story/storage/archive/ProjectArchiveLayout.ts";
import { getBookLayout } from "../../src/main/story/storage/book/BookLayout.ts";

const roots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-project-archive-"));
  roots.push(root);
  const agentHome = path.join(root, ".mini-agent");
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  mkdirSync(path.join(agentHome, "workSpaceRoot"), { recursive: true });
  writeFileSync(path.join(agentHome, "config.json"), JSON.stringify({ AGENT_WORKSPACE: "" }));
  const database = new ApplicationDatabase(agentHome);
  const projectStore = new SqliteProjectStore(database.handle);
  const projects = new ProjectApplication(projectStore);
  const books = new SqliteBookStore(database.handle);
  const archiveStore = new SqliteProjectArchiveStore(database.handle);
  const runtimes = new BookRuntimeManager(agentHome, books);
  const provisioning = new BookProvisioningService(agentHome, books, runtimes);
  const archives = new ProjectArchiveService(agentHome, projects, books, archiveStore, runtimes);
  const projectsRoot = path.join(root, "projects");
  mkdirSync(projectsRoot);
  const project = projects.createProject({ name: "Archive", parentPath: projectsRoot });
  const provisioned = provisioning.createForProject(project.id, {
    id: `novel_${crypto.randomUUID()}`,
    title: "Archived book",
    synopsis: "",
    status: "writing",
  });
  const novels = new NovelApplication(provisioned.lease.persistence);
  const novel = novels.getProjectBook();
  if (!novel) throw new Error("Provisioned novel is missing.");
  const chapter = novels.createChapter({
    novelId: novel.id,
    volumeId: null,
    title: "First",
    sortOrder: 0,
  });
  novels.saveRevision({
    chapterId: chapter.id,
    content: "archived content",
    expectedCurrentRevisionId: null,
  });
  const projectDatabase = new ProjectDatabase(getWorkspaceLayout(project.path).projectDatabasePath);
  const threads = new ThreadApplication(new SqliteThreadStore(projectDatabase.handle));
  const thread = threads.createThread({ title: "Recovery conversation" });
  threads.appendMessage({ threadId: thread.id, role: "user", content: "remember me" });
  projectDatabase.close();
  writeFileSync(path.join(project.path, "notes.md"), "project file");
  writeFileSync(
    path.join(getWorkspaceLayout(project.path).skillsRoot, "skill.md"),
    "project skill",
  );
  return {
    archiveStore,
    archives,
    books,
    database,
    project,
    projects,
    projectsRoot,
    provisioned,
    root,
    runtimes,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ProjectArchiveService behavior", () => {
  it("returns safe archive summaries with server-calculated strategies", async () => {
    const harness = createHarness();
    harness.provisioned.lease.close();
    const archived = await harness.archives.createForProjectDeletion(harness.project.id);

    expect(harness.archives.listSummaries(harness.provisioned.bookId)).toEqual([
      expect.objectContaining({
        archiveId: archived.id,
        projectName: "Archive",
        originalProjectPath: harness.project.path,
        state: "available",
        containsBookSnapshot: true,
        availableBookStrategies: ["snapshot"],
      }),
    ]);
    expect(harness.archives.listSummaries(harness.provisioned.bookId)[0]).not.toHaveProperty(
      "archivePath",
    );

    harness.projects.removeProject(harness.project.path);
    rmSync(harness.project.path, { recursive: true, force: true });
    expect(
      harness.archives.listSummaries(harness.provisioned.bookId)[0]?.availableBookStrategies,
    ).toEqual(["snapshot", "current"]);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("restores project work data and an immutable book snapshot", async () => {
    const harness = createHarness();
    harness.provisioned.lease.close();
    const archived = await harness.archives.createForProjectDeletion(harness.project.id);
    expect(archived.state).toBe("available");
    harness.projects.removeProject(harness.project.path);
    rmSync(harness.project.path, { recursive: true, force: true });

    const currentLease = harness.runtimes.acquire(harness.provisioned.bookId);
    const currentNovels = new NovelApplication(currentLease.persistence);
    const currentBook = currentNovels.getProjectBook();
    if (!currentBook) throw new Error("Current book is missing.");
    const currentChapter = currentNovels.listChapters(currentBook.id)[0];
    currentNovels.saveRevision({
      chapterId: currentChapter.id,
      content: "new bookshelf content",
      expectedCurrentRevisionId: currentChapter.currentRevisionId,
    });
    currentLease.close();

    const targetPath = path.join(harness.projectsRoot, "restored-snapshot");
    const restored = harness.archives.restore({
      archiveId: archived.id,
      targetPath,
      bookStrategy: "snapshot",
    });

    expect(restored.projectId).toBe(harness.project.id);
    expect(restored.bookId).not.toBe(harness.provisioned.bookId);
    expect(readFileSync(path.join(targetPath, "notes.md"), "utf8")).toBe("project file");
    expect(
      readFileSync(path.join(getWorkspaceLayout(targetPath).skillsRoot, "skill.md"), "utf8"),
    ).toBe("project skill");
    const restoredProjectDatabase = new ProjectDatabase(
      getWorkspaceLayout(targetPath).projectDatabasePath,
    );
    const restoredThreads = new ThreadApplication(
      new SqliteThreadStore(restoredProjectDatabase.handle),
    );
    expect(restoredThreads.listMessages()[0]?.content).toBe("remember me");
    restoredProjectDatabase.close();
    if (!restored.bookId) throw new Error("Restored book id is missing.");
    const restoredLease = harness.runtimes.acquire(restored.bookId);
    const restoredNovels = new NovelApplication(restoredLease.persistence);
    const restoredBook = restoredNovels.getProjectBook();
    if (!restoredBook) throw new Error("Restored book is missing.");
    const restoredChapter = restoredNovels.listChapters(restoredBook.id)[0];
    expect(restoredNovels.getCurrentRevision(restoredChapter.id)?.content).toBe(
      canonicalDoc(textDoc("archived content")),
    );
    restoredLease.close();
    expect(harness.archiveStore.getById(archived.id)?.state).toBe("restored");
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("can restore a project by attaching the current bookshelf book", async () => {
    const harness = createHarness();
    harness.provisioned.lease.close();
    const archived = await harness.archives.createForProjectDeletion(harness.project.id);
    harness.projects.removeProject(harness.project.path);
    rmSync(harness.project.path, { recursive: true, force: true });
    const targetPath = path.join(harness.projectsRoot, "restored-current");

    const restored = harness.archives.restore({
      archiveId: archived.id,
      targetPath,
      bookStrategy: "current",
    });

    expect(restored.bookId).toBe(harness.provisioned.bookId);
    expect(harness.books.getBookForProject(restored.projectId)?.id).toBe(
      harness.provisioned.bookId,
    );
    expect(existsSync(targetPath)).toBe(true);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("does not make an archive available when snapshot creation fails", async () => {
    const harness = createHarness();

    await expect(harness.archives.createForProjectDeletion(harness.project.id)).rejects.toThrow(
      "runtime is still in use",
    );

    expect(existsSync(harness.project.path)).toBe(true);
    expect(harness.projects.getSnapshot().projects).toHaveLength(1);
    expect(harness.archiveStore.list()[0]?.state).toBe("corrupted");
    harness.provisioned.lease.close();
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("rejects a damaged archive without publishing restored data", async () => {
    const harness = createHarness();
    harness.provisioned.lease.close();
    const archived = await harness.archives.createForProjectDeletion(harness.project.id);
    harness.projects.removeProject(harness.project.path);
    rmSync(harness.project.path, { recursive: true, force: true });
    writeFileSync(path.join(archived.archivePath, "project", "notes.md"), "tampered");
    const targetPath = path.join(harness.projectsRoot, "damaged");

    expect(() =>
      harness.archives.restore({
        archiveId: archived.id,
        targetPath,
        bookStrategy: "snapshot",
      }),
    ).toThrow("checksum mismatch");

    expect(existsSync(targetPath)).toBe(false);
    expect(harness.projects.getSnapshot().projects).toHaveLength(0);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("finishes a restore interrupted after files were published", async () => {
    const harness = createHarness();
    harness.provisioned.lease.close();
    const archived = await harness.archives.createForProjectDeletion(harness.project.id);
    harness.projects.removeProject(harness.project.path);
    rmSync(harness.project.path, { recursive: true, force: true });
    const targetPath = path.join(harness.projectsRoot, "interrupted");
    const restoredBookId = `book_${crypto.randomUUID()}`;
    const restoredBookLayout = getBookLayout(
      path.join(harness.root, ".mini-agent"),
      restoredBookId,
    );
    const operationId = `project_restore_${crypto.randomUUID()}`;
    harness.archiveStore.beginRestore({
      id: operationId,
      archiveId: archived.id,
      targetPath,
      bookStrategy: "snapshot",
      restoredBookId,
    });
    const archiveLayout = getProjectArchiveLayout(archived.archivePath);
    copyProjectDirectory(archiveLayout.projectPath, targetPath);
    markOperationDirectory(targetPath, operationId);
    mkdirSync(restoredBookLayout.rootPath, { recursive: true });
    copyFileSync(archiveLayout.bookSnapshotPath, restoredBookLayout.databasePath);
    BookDatabase.identifyCopy(restoredBookLayout.databasePath, restoredBookId);
    markOperationDirectory(restoredBookLayout.rootPath, operationId);

    harness.archives.reconcile();

    expect(harness.archiveStore.listIncompleteOperations()).toEqual([]);
    expect(harness.archiveStore.getById(archived.id)?.state).toBe("restored");
    expect(harness.books.getBookForProject(harness.project.id)?.id).toBe(restoredBookId);
    expect(existsSync(targetPath)).toBe(true);
    harness.runtimes.closeAll();
    harness.database.close();
  });
});
