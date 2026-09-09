import {
  serializeTiptapDocument,
  plainTextToTiptapDocument,
} from "../src/shared/book/richText.ts";
const doc = (text: string) =>
  serializeTiptapDocument(plainTextToTiptapDocument(text));
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync } from "node:fs";
import ApplicationDatabase from "../src/main/agent/storage/global/ApplicationDatabase.ts";
import SqliteBookStore from "../src/main/agent/storage/global/SqliteBookStore.ts";
import SqliteBookReadingStateStore from "../src/main/agent/storage/global/SqliteBookReadingStateStore.ts";
import BookRuntimeManager from "../src/main/agent/runtime/BookRuntimeManager.ts";
import BookProvisioningService from "../src/main/agent/application/BookProvisioningService.ts";
import BookReaderApplication from "../src/main/agent/application/BookReaderApplication.ts";
import { DEFAULT_READER_PREFERENCES } from "../src/shared/book/reader.ts";
import {
  createReaderAnchor,
  restoreReaderAnchor,
  spreadIndices,
  ReaderChapterCache,
  type MeasuredChapter,
} from "../src/renderer/pages/reader/readerModel.ts";

const root = path.resolve("test-results/reader-storage", crypto.randomUUID());
mkdirSync(root, { recursive: true });
const database = new ApplicationDatabase(root);
const books = new SqliteBookStore(database.handle);
const runtimes = new BookRuntimeManager(root, books);
const reader = new BookReaderApplication(
  runtimes,
  new SqliteBookReadingStateStore(database.handle),
);
try {
  const provisioner = new BookProvisioningService(root, books, runtimes);
  const book = provisioner.createStandalone({
    id: "novel-reader",
    title: "读者之书",
    synopsis: "",
    status: "writing",
  });
  const lease = runtimes.acquire(book.bookId);
  try {
    lease.persistence.createChapter({
      id: "chapter-one",
      novelId: book.bookId,
      volumeId: null,
      title: "第一章",
      status: "draft",
      sortOrder: 0,
    });
    lease.persistence.saveRevision({
      id: "revision-one",
      chapterId: "chapter-one",
      content: doc("已保存的第一版。"),
      contentHash: "hash-one",
      characterCount: 8,
      changeSummary: "",
      expectedCurrentRevisionId: null,
    });
  } finally {
    lease.close();
  }
  const snapshot = reader.open(1, book.bookId);
  assert.equal(snapshot.chapters[0].revisionId, "revision-one");
  assert.ok(
    !("content" in snapshot.chapters[0]),
    "manifest must not transfer chapter bodies",
  );
  assert.throws(() =>
    reader.read(2, {
      snapshotId: snapshot.snapshotId,
      chapterId: "chapter-one",
    }),
  );
  assert.throws(() =>
    reader.read(1, {
      snapshotId: snapshot.snapshotId,
      chapterId: "another-book-chapter",
    }),
  );
  const nextLease = runtimes.acquire(book.bookId);
  try {
    nextLease.persistence.saveRevision({
      id: "revision-two",
      chapterId: "chapter-one",
      content: doc("修改后的第二版。"),
      contentHash: "hash-two",
      characterCount: 8,
      changeSummary: "",
      expectedCurrentRevisionId: "revision-one",
    });
  } finally {
    nextLease.close();
  }
  assert.equal(reader.status(1, snapshot.snapshotId), "changed");
  assert.equal(
    reader.read(1, {
      snapshotId: snapshot.snapshotId,
      chapterId: "chapter-one",
    }).content,
    doc("已保存的第一版。"),
  );
  const anchor = {
    chapterId: "chapter-one",
    revisionId: "revision-one",
    position: 4,
    textOffset: 3,
    quote: "第一版",
    prefix: "",
    suffix: "",
  };
  reader.save(1, {
    snapshotId: snapshot.snapshotId,
    sequence: 2,
    anchor,
    preferences: DEFAULT_READER_PREFERENCES,
  });
  reader.save(1, {
    snapshotId: snapshot.snapshotId,
    sequence: 1,
    anchor: null,
    preferences: DEFAULT_READER_PREFERENCES,
  });
  assert.throws(() =>
    reader.save(1, {
      snapshotId: snapshot.snapshotId,
      sequence: 3,
      anchor: { ...anchor, revisionId: "revision-two" },
      preferences: DEFAULT_READER_PREFERENCES,
    }),
  );
  const restored = reader.open(1, book.bookId);
  assert.equal(restored.readingState?.anchor?.position, 4);
  assert.throws(
    () =>
      reader.read(1, {
        snapshotId: snapshot.snapshotId,
        chapterId: "chapter-one",
      }),
    "superseded session must not remain writable",
  );
  reader.closeOwner(1);
  assert.throws(() => reader.status(1, restored.snapshotId));
  // Closing the runtime proves there is no lease held by the reader session.
  runtimes.closeBook(book.bookId);
  database.handle
    .prepare("DELETE FROM book_registry WHERE book_id = ?")
    .run(book.bookId);
  assert.equal(
    (
      database.handle
        .prepare("SELECT count(*) AS n FROM reading_states")
        .get() as { n: number }
    ).n,
    0,
  );

  assert.deepEqual(spreadIndices(0, true), [-1, 0]);
  assert.deepEqual(spreadIndices(2, true), [1, 2]);
  assert.deepEqual(spreadIndices(3, false), [3]);
  const text = "灯火🏡e\u0301照亮归途，灯火照亮归途。";
  const chapter: MeasuredChapter = {
    chapterId: "chapter",
    revisionId: "old",
    text,
    positions: Uint32Array.from({ length: text.length }, (_, i) => i + 1),
    pages: [],
    bytes: 200,
  };
  const original = createReaderAnchor(chapter, 3);
  assert.ok(!original.quote.startsWith("\udfe1"));
  assert.equal(restoreReaderAnchor(chapter, original).position, 3);
  const updatedText = "序言：" + text;
  const updated = {
    ...chapter,
    revisionId: "new",
    text: updatedText,
    positions: Uint32Array.from(
      { length: updatedText.length },
      (_, i) => i + 1,
    ),
  };
  assert.equal(restoreReaderAnchor(updated, original).position, 6);
  const cache = new ReaderChapterCache(300);
  cache.set("one", chapter);
  cache.set("two", updated);
  assert.equal(cache.get("one"), undefined);
  assert.equal(cache.get("two"), updated);
  console.log(
    "Reader storage/model checks passed: fixed revisions, ownership, sequence, cascade cleanup, leases, Unicode anchors and bounded cache.",
  );
} finally {
  reader.dispose();
  runtimes.closeAll();
  database.close();
}
