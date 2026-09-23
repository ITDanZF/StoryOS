import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import BookDatabase, { BOOK_DATABASE_APPLICATION_ID } from "./BookDatabase.ts";
import { BOOK_CHANGE_TRIGGERS, BOOK_SCHEMA } from "./bookSchema.ts";
import SqliteNovelStore from "./SqliteNovelStore.ts";
import SqliteOutlineStore from "./SqliteOutlineStore.ts";
import OutlineApplication from "../../application/outline/OutlineApplication.ts";
import { eventNode } from "../../application/outline/outlineFixture.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("outline storage", () => {
  it("migrates version 101 without changing existing volume or chapter rows", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "storyos-outline-migrate-"));
    directories.push(directory);
    const file = path.join(directory, "book.sqlite");
    const raw = new Database(file);
    raw.pragma(`application_id = ${BOOK_DATABASE_APPLICATION_ID}`);
    raw.exec(BOOK_SCHEMA + BOOK_CHANGE_TRIGGERS);
    raw.pragma("user_version = 100");
    const now = Date.now();
    raw
      .prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES ('book-1', '旧书', '简介', 'writing', ?, ?)",
      )
      .run(now, now);
    raw
      .prepare(
        "INSERT INTO volumes(id, book_id, title, summary, position, created_at, updated_at) VALUES ('volume-1', 'book-1', '卷一', '卷摘要', 1, ?, ?)",
      )
      .run(now, now);
    raw
      .prepare(
        "INSERT INTO chapters(id, book_id, volume_id, title, status, position, created_at, updated_at) VALUES ('chapter-1', 'book-1', 'volume-1', '旧章', 'draft', 1, ?, ?)",
      )
      .run(now, now);
    raw.close();

    const migrated = new BookDatabase(file);
    try {
      expect(migrated.handle.pragma("user_version", { simple: true })).toBe(101);
      expect(migrated.handle.prepare("SELECT title, summary FROM volumes").all()).toEqual([
        { title: "卷一", summary: "卷摘要" },
      ]);
      expect(migrated.handle.prepare("SELECT title, status FROM chapters").all()).toEqual([
        { title: "旧章", status: "draft" },
      ]);
      expect(
        (migrated.handle.prepare("PRAGMA table_info(chapters)").all() as { name: string }[]).map(
          (column) => column.name,
        ),
      ).toEqual([
        "id",
        "book_id",
        "volume_id",
        "title",
        "status",
        "position",
        "current_revision_id",
        "row_version",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);
      expect(migrated.handle.prepare("SELECT COUNT(*) AS count FROM outlines").get()).toEqual({ count: 0 });
    } finally {
      migrated.close();
    }
  });

  it("deletes chapter mappings and keeps the outline node", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "storyos-outline-delete-"));
    directories.push(directory);
    const database = new BookDatabase(path.join(directory, "book.sqlite"));
    try {
      const now = Date.now();
      database.handle
        .prepare(
          "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES ('book-1', '书', '', 'writing', ?, ?)",
        )
        .run(now, now);
      database.handle
        .prepare(
          "INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at) VALUES ('chapter-1', 'book-1', '第一章', 'draft', 1, ?, ?)",
        )
        .run(now, now);
      const outline = new OutlineApplication(new SqliteOutlineStore(database.handle), { model: null });
      const created = outline.createOutline({
        projectId: "project-1",
        title: "总纲",
        premise: "",
        theme: "主题",
        coreConflict: "冲突",
        climaxSummary: "",
        endingIntent: "结局",
      });
      const applied = outline.applyOutlinePatch({
        projectId: "project-1",
        patch: {
          outlineId: created.outline.id,
          expectedRevision: 1,
          operations: [{ type: "create_node", tempId: "leaf", value: eventNode() }],
        },
      });
      const nodeId = applied.snapshot.nodes[0]?.id;
      if (!nodeId) throw new Error("node missing");
      outline.mapOutlineNodes({
        projectId: "project-1",
        expectedRevision: applied.snapshot.outline.revision,
        chapterId: "chapter-1",
        nodeIds: [nodeId],
      });
      new SqliteNovelStore(database.handle).deleteChapter("chapter-1");
      const saved = outline.getOutlineSnapshot("project-1");
      expect(saved?.nodes.map((node) => node.id)).toEqual([nodeId]);
      expect(saved?.mappings).toEqual([]);
      expect(database.handle.prepare("SELECT title FROM chapters WHERE id = 'chapter-1'").get()).toEqual({
        title: "第一章",
      });
    } finally {
      database.close();
    }
  });
});
