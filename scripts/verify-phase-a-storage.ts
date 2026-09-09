import BookTransferService from "../src/main/agent/application/BookTransferService.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import ApplicationDatabase from "../src/main/agent/storage/global/ApplicationDatabase.ts";
import BookDatabase from "../src/main/agent/storage/book/BookDatabase.ts";
import ProjectDatabase from "../src/main/agent/storage/project/ProjectDatabase.ts";
import SqliteProjectStore from "../src/main/agent/storage/global/SqliteProjectStore.ts";
import SqliteBookStore from "../src/main/agent/storage/global/SqliteBookStore.ts";
import BookCatalogProjection from "../src/main/agent/storage/global/BookCatalogProjection.ts";
import SqliteBookReadingStateStore from "../src/main/agent/storage/global/SqliteBookReadingStateStore.ts";
import SqliteProjectArchiveStore from "../src/main/agent/storage/global/SqliteProjectArchiveStore.ts";
import SqliteNovelStore from "../src/main/agent/storage/book/SqliteNovelStore.ts";
import SqliteThreadStore from "../src/main/agent/storage/project/SqliteThreadStore.ts";
import SqliteRunStore from "../src/main/agent/storage/project/SqliteRunStore.ts";
import SqliteConversationEventStore from "../src/main/agent/storage/project/SqliteConversationEventStore.ts";
import { rebuildMessageViews } from "../src/main/agent/storage/project/conversationProjection.ts";
import BookRuntimeManager from "../src/main/agent/runtime/BookRuntimeManager.ts";
import BookProvisioningService from "../src/main/agent/application/BookProvisioningService.ts";
import BookLifecycleService from "../src/main/agent/application/BookLifecycleService.ts";
import NovelApplication from "../src/main/agent/application/NovelApplication.ts";
import {
  markOperationDirectory,
  removeOperationDirectory,
} from "../src/main/agent/storage/common/operationOwnership.ts";
import { DEFAULT_READER_PREFERENCES } from "../src/shared/book/reader.ts";
import {
  serializeTiptapDocument,
  plainTextToTiptapDocument,
} from "../src/shared/book/richText.ts";

async function verify() {
  const root = path.resolve(
    "test-results/phase-a-storage",
    crypto.randomUUID(),
  );
  mkdirSync(root, { recursive: true });
  const app = new ApplicationDatabase(root);
  const project = new ProjectDatabase(path.join(root, "project.sqlite"));
  const registry = new SqliteBookStore(app.handle);
  const catalog = new BookCatalogProjection(app.handle);
  const runtimes = new BookRuntimeManager(root, registry, catalog);
  const doc = (text: string) =>
    serializeTiptapDocument(plainTextToTiptapDocument(text));
  const checks: string[] = [];
  try {
    const projects = new SqliteProjectStore(app.handle);
    projects.upsertProject({
      id: "project-a",
      path: path.join(root, "workspace"),
      name: "项目",
      locationType: "created",
    });
    assert.throws(() =>
      projects.upsertProject({
        id: "project-b",
        path: path.join(root, "workspace"),
        name: "同路径",
        locationType: "linked",
      }),
    );
    const provision = new BookProvisioningService(root, registry, runtimes);
    const created = provision.createForProject("project-a", {
      id: "ignored-input-id",
      title: "测试书",
      synopsis: "摘要",
      status: "writing",
    });
    assert.equal(created.novel.id, created.bookId);
    const novels = new NovelApplication(created.lease.persistence);
    const volume = novels.createVolume({
      novelId: created.bookId,
      title: "第一卷",
      sortOrder: 0,
    });
    const first = novels.createChapter({
      novelId: created.bookId,
      volumeId: volume.id,
      title: "第一章",
      sortOrder: 0,
    });
    const second = novels.createChapter({
      novelId: created.bookId,
      volumeId: volume.id,
      title: "第二章",
      sortOrder: 1,
    });
    const initial = novels.saveRevision({
      chapterId: first.id,
      content: doc("山川 天地"),
      expectedCurrentRevisionId: null,
      expectedRowVersion: first.rowVersion,
    });
    assert.equal(initial.characterCount, 4);
    assert.equal(catalog.read(created.bookId)?.character_count, 4);
    const draft = novels.saveDraft({
      chapterId: first.id,
      baseRevisionId: initial.id,
      expectedDraftVersion: 0,
      content: doc("可恢复草稿"),
    });
    assert.throws(
      () =>
        novels.saveDraft({
          chapterId: first.id,
          baseRevisionId: initial.id,
          expectedDraftVersion: 0,
          content: doc("旧窗口"),
        }),
      /草稿/,
    );
    assert.throws(
      () =>
        novels.saveRevision({
          chapterId: first.id,
          content: doc("冲突正文"),
          expectedCurrentRevisionId: null,
        }),
      /conflict/,
    );
    assert.equal(novels.getDraft(first.id)?.content, draft.content);
    const head = novels.getChapter(first.id);
    const saved = novels.saveRevision({
      chapterId: first.id,
      content: draft.content,
      expectedCurrentRevisionId: initial.id,
      expectedRowVersion: head.rowVersion,
      expectedDraftVersion: draft.draftVersion,
    });
    assert.equal(novels.getDraft(first.id), null);
    const bookPath = path.join(
      registry.getBookById(created.bookId)!.storagePath,
      "book.sqlite",
    );
    const direct = new BookDatabase(bookPath);
    try {
      assert.throws(
        () =>
          direct.handle
            .prepare("UPDATE chapters SET current_revision_id=? WHERE id=?")
            .run(saved.id, second.id),
        /FOREIGN KEY/,
      );
      assert.throws(
        () =>
          direct.handle
            .prepare(
              "UPDATE revision_documents SET plain_text='mutated' WHERE revision_id=?",
            )
            .run(saved.id),
        /immutable/,
      );
      assert.equal(
        (
          direct.handle
            .prepare(
              "SELECT parent_revision_id FROM chapter_revisions WHERE id=?",
            )
            .get(saved.id) as { parent_revision_id: string }
        ).parent_revision_id,
        initial.id,
      );
      const before = direct.handle
        .prepare("SELECT id,position,row_version FROM chapters ORDER BY id")
        .all() as { id: string; position: number; row_version: number }[];
      novels.updateChapter({ ...novels.getChapter(second.id), sortOrder: 0 });
      const after = direct.handle
        .prepare("SELECT id,position,row_version FROM chapters ORDER BY id")
        .all() as typeof before;
      assert.deepEqual(
        after.find((r) => r.id === first.id),
        before.find((r) => r.id === first.id),
        "ordinary move must not rewrite siblings",
      );
      assert.equal(novels.listChapters(created.bookId)[0].id, second.id);
      assert.ok(
        (
          direct.handle
            .prepare("SELECT count(*) AS n FROM book_changes")
            .get() as { n: number }
        ).n >= 5,
      );
      const countBefore = (
        direct.handle
          .prepare("SELECT count(*) AS n FROM chapter_revisions")
          .get() as { n: number }
      ).n;
      assert.throws(() =>
        novels.saveRevision({
          chapterId: first.id,
          content: doc("原子性"),
          expectedCurrentRevisionId: saved.id,
          expectedDraftVersion: 999,
        }),
      );
      assert.equal(
        (
          direct.handle
            .prepare("SELECT count(*) AS n FROM chapter_revisions")
            .get() as { n: number }
        ).n,
        countBefore,
      );
      const clonePath = path.join(root, "clone.sqlite");
      await direct.handle.backup(clonePath);
      BookDatabase.identifyCopy(clonePath, "book-clone");
      const clone = new BookDatabase(clonePath);
      assert.equal(
        new SqliteNovelStore(clone.handle).listNovels()[0].id,
        "book-clone",
      );
      assert.deepEqual(clone.handle.pragma("foreign_key_check"), []);
      clone.close();
    } finally {
      direct.close();
    }
    checks.push(
      "unified identity, canonical text, sparse order, revision ownership, immutable documents, transactional CAS and draft recovery",
    );
    const transfer = new BookTransferService(root, registry, runtimes);
    const preview = transfer.prepareExport({
      bookId: created.bookId,
      format: "storyos",
    });
    const beforeExport = novels.getCurrentRevision(first.id);
    const exportHead = novels.getChapter(first.id);
    novels.saveRevision({
      chapterId: first.id,
      content: doc("预览后的新正文"),
      expectedCurrentRevisionId: exportHead.currentRevisionId,
      expectedRowVersion: exportHead.rowVersion,
    });
    const outputPath = path.join(root, "frozen.storyos-book");
    await transfer.commitExport({ exportId: preview.exportId, outputPath });
    const imported = transfer.importBook({ packagePath: outputPath });
    const importedLease = runtimes.acquire(imported.bookId);
    try {
      const importedNovel = new NovelApplication(importedLease.persistence);
      assert.equal(importedNovel.getProjectBook()?.id, imported.bookId);
      assert.equal(
        importedNovel.getCurrentRevision(first.id)?.content,
        beforeExport?.content,
      );
    } finally {
      importedLease.close();
    }
    checks.push(
      "native export confirmation uses preview snapshot; import receives a new book identity",
    );
    const reading = new SqliteBookReadingStateStore(app.handle);
    const state = {
      bookId: created.bookId,
      schemaVersion: 1 as const,
      anchor: null as
        | import("../src/shared/book/reader.ts").ReaderAnchor
        | null,
      preferences: DEFAULT_READER_PREFERENCES,
      lastReadAt: new Date().toISOString(),
    };
    reading.save(state, 0);
    reading.save(state, 1);
    assert.throws(() => reading.save(state, 1), /其他窗口/);
    assert.equal(reading.get(created.bookId)?.stateVersion, 2);
    checks.push("reading state CAS across independently loaded windows");

    const threads = new SqliteThreadStore(project.handle);
    const events = new SqliteConversationEventStore(project.handle);
    const runs = new SqliteRunStore(project.handle, 1);
    threads.createThread("新对话", "thread-a");
    for (let i = 0; i < 3; i++) {
      const runId = `run-${i}`;
      const timestamp = new Date().toISOString();
      await runs.record({
        type: "run_started",
        runId,
        threadId: "thread-a",
        timestamp,
      });
      const user = {
        type: "user.message.created" as const,
        eventId: `user-${i}`,
        runId,
        threadId: "thread-a",
        sequence: 1,
        timestamp,
        payload: { messageId: `message-${i}`, content: `问题${i}` },
      };
      await events.record(user);
      await events.record(user);
      await events.record({
        type: "turn.completed",
        eventId: `done-${i}`,
        runId,
        threadId: "thread-a",
        sequence: 2,
        timestamp,
        payload: { content: `回答${i}`, durationMs: 1 },
      });
      await runs.record({
        type: "run_completed",
        runId,
        timestamp,
        content: `回答${i}`,
        durationMs: 1,
      });
    }
    const page = await events.listByThread("thread-a", 0, 3);
    assert.equal(page.length, 3);
    const rest = await events.listByThread(
      "thread-a",
      page[2].threadSequence,
      3,
    );
    assert.equal(rest.length, 3);
    assert.equal(new Set([...page, ...rest].map((e) => e.eventId)).size, 6);
    assert.equal(threads.listMessages("thread-a").length, 6);
    const views = project.handle
      .prepare("SELECT * FROM message_views ORDER BY first_sequence")
      .all();
    rebuildMessageViews(project.handle, "thread-a");
    assert.deepEqual(
      project.handle
        .prepare("SELECT * FROM message_views ORDER BY first_sequence")
        .all(),
      views,
    );
    assert.deepEqual(project.handle.pragma("foreign_key_check"), []);
    checks.push(
      "cross-run event order, idempotency, cursor pages, message rebuild, referenced run retention",
    );

    const archives = new SqliteProjectArchiveStore(app.handle);
    archives.create({
      id: "archive-a",
      sourceProjectId: "project-a",
      bookId: created.bookId,
      archivePath: path.join(root, "archive-a"),
      formatVersion: 1,
      createdAt: new Date(),
    });
    archives.beginRestore({
      id: "restore-a",
      archiveId: "archive-a",
      targetPath: path.join(root, "restored"),
      bookStrategy: "snapshot",
      restoredBookId: "copy",
    });
    archives.updateOperation({
      operationId: "restore-a",
      state: "files_published",
    });
    assert.equal(
      archives.listIncompleteOperations()[0].state,
      "files_published",
    );
    assert.throws(
      () =>
        app.handle.prepare("DELETE FROM archives WHERE id='archive-a'").run(),
      /FOREIGN KEY/,
    );
    archives.updateOperation({ operationId: "restore-a", state: "completed" });
    const foreign = path.join(root, "foreign");
    mkdirSync(foreign);
    writeFileSync(path.join(foreign, "keep.txt"), "keep");
    assert.throws(
      () => removeOperationDirectory(foreign, "some-operation"),
      /does not own/,
    );
    assert.ok(existsSync(path.join(foreign, "keep.txt")));
    checks.push("restore phases and deletion ownership guards");

    created.lease.close();
    registry.detachBook("project-a");
    const lifecycle = new BookLifecycleService(root, registry, runtimes);
    lifecycle.moveToTrash(created.bookId);
    assert.equal(registry.listTrash()[0].title, "测试书");
    lifecycle.restoreFromTrash(created.bookId);
    lifecycle.moveToTrash(created.bookId);
    const operationId = `book_delete_${crypto.randomUUID()}`;
    const stagingPath = path.join(root, "library", ".deleting", operationId);
    registry.beginBookCleanup({
      operationId,
      bookId: created.bookId,
      stagingPath,
    });
    mkdirSync(path.dirname(stagingPath), { recursive: true });
    markOperationDirectory(
      registry.getBookById(created.bookId)!.storagePath,
      operationId,
    );
    lifecycle.recoverPendingCleanups();
    assert.equal(registry.getBookById(created.bookId), null);
    assert.equal(reading.get(created.bookId), null);
    assert.equal(registry.listPendingBookCleanups().length, 0);
    assert.ok(!existsSync(stagingPath));
    assert.equal(archives.getById("archive-a")?.bookId, created.bookId);
    checks.push(
      "trash/restore, interrupted cleanup replay, surviving archive source identity",
    );

    const oldPath = path.join(root, "old.sqlite");
    const old = new Database(oldPath);
    old.pragma("application_id=1398034242");
    old.pragma("user_version=1");
    old.close();
    assert.throws(() => new BookDatabase(oldPath), /reset required/);
    checks.push("old schemas rejected without destructive startup migration");
    assert.deepEqual(app.handle.pragma("foreign_key_check"), []);
    const large = new BookDatabase(path.join(root, "large.sqlite"));
    const store = new SqliteNovelStore(large.handle);
    store.createNovel({
      id: "bench-book",
      title: "千章目录",
      synopsis: "",
      status: "writing",
    });
    large.handle.transaction(() => {
      for (let i = 0; i < 1000; i++)
        store.createChapter({
          id: `bench-${i}`,
          novelId: "bench-book",
          volumeId: null,
          title: `第${i}章`,
          status: "draft",
          sortOrder: i,
        });
    })();
    const summaries = store.listChapterSummaries("bench-book");
    assert.equal(summaries.length, 1000);
    summaries.forEach((chapter, index) => {
      assert.equal(chapter.sortOrder, index);
      assert.equal(chapter.characterCount, 0);
      assert.equal(chapter.revisionNumber, null);
      assert.ok(!("content" in chapter));
    });
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const manifest = store.readReaderManifest();
      times.push(performance.now() - start);
      assert.equal(manifest.chapters.length, 1000);
      assert.ok(!("content" in manifest.chapters[0]));
    }
    times.sort((a, b) => a - b);
    large.close();
    const timings = {
      thousandChapterManifestMs: { p50: times[10], p95: times[19] },
      samples: 20,
    };
    console.log(
      JSON.stringify(
        { passed: checks.length, checks, timings, artifacts: root },
        null,
        2,
      ),
    );
  } finally {
    runtimes.closeAll();
    project.close();
    app.close();
  }
}
void verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
