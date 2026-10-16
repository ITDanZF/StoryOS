import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import BookDatabase from "./BookDatabase.ts";
import SqliteNovelStore from "./SqliteNovelStore.ts";
import SqliteOutlineStore from "./SqliteOutlineStore.ts";
import OutlineApplication from "../../application/outline/OutlineApplication.ts";
import { eventNode } from "../../application/outline/outlineFixture.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("outline storage", () => {
  it("creates the cross-chapter mapping schema in a fresh book", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "storyos-outline-schema-"));
    directories.push(directory);
    const file = path.join(directory, "book.sqlite");
    const database = new BookDatabase(file);
    try {
      expect(database.handle.pragma("user_version", { simple: true })).toBe(103);
      const columns = database.handle.prepare("PRAGMA table_info(outline_node_chapters)").all() as { name: string }[];
      expect(columns.map((column) => column.name)).toContain("segment_intent");
      expect(columns.map((column) => column.name)).toContain("expected_local_change");
      expect(database.handle.pragma("foreign_key_check")).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("keeps one event mapped to two chapters and unmaps only the selected chapter", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "storyos-outline-multi-chapter-"));
    directories.push(directory);
    const database = new BookDatabase(path.join(directory, "book.sqlite"));
    try {
      const now = Date.now();
      database.handle.prepare(
        "INSERT INTO books(id, title, synopsis, status, created_at, updated_at) VALUES ('book-1', '书', '', 'writing', ?, ?)",
      ).run(now, now);
      for (const [id, position] of [["chapter-1", 1], ["chapter-2", 2]] as const) {
        database.handle.prepare(
          "INSERT INTO chapters(id, book_id, title, status, position, created_at, updated_at) VALUES (?, 'book-1', ?, 'draft', ?, ?, ?)",
        ).run(id, id, position, now, now);
      }
      const outline = new OutlineApplication(new SqliteOutlineStore(database.handle), { model: null });
      const created = outline.createOutline({
        projectId: "project-1", title: "总纲", premise: "", theme: "", coreConflict: "", climaxSummary: "", endingIntent: "",
      });
      const accepted = outline.applyOutlinePatch({
        projectId: "project-1",
        patch: {
          outlineId: created.outline.id,
          expectedRevision: created.outline.revision,
          operations: [{ type: "create_node", tempId: "event", value: eventNode() }],
        },
      }).snapshot;
      const nodeId = accepted.nodes[0]?.id;
      if (!nodeId) throw new Error("node missing");
      const first = outline.mapOutlineNodes({
        projectId: "project-1", expectedRevision: accepted.outline.revision, chapterId: "chapter-1",
        mappings: [{ nodeId, segmentIntent: "产生怀疑", expectedLocalChange: "开始调查" }],
      });
      const second = outline.mapOutlineNodes({
        projectId: "project-1", expectedRevision: first.outline.revision, chapterId: "chapter-2",
        mappings: [{ nodeId, segmentIntent: "完成对质", expectedLocalChange: "确认真相" }],
      });
      expect(second.mappings.map((mapping) => [mapping.chapterId, mapping.expectedLocalChange])).toEqual([
        ["chapter-1", "开始调查"], ["chapter-2", "确认真相"],
      ]);
      const reopened = new BookDatabase(path.join(directory, "book.sqlite"));
      try {
        expect(new SqliteOutlineStore(reopened.handle).readActive()?.mappings.map((mapping) => mapping.chapterId))
          .toEqual(["chapter-1", "chapter-2"]);
      } finally {
        reopened.close();
      }
      const remaining = outline.unmapOutlineNode({
        projectId: "project-1", expectedRevision: second.outline.revision, chapterId: "chapter-1", nodeId,
      });
      expect(remaining.mappings).toMatchObject([{
        chapterId: "chapter-2", nodeId, segmentIntent: "完成对质", expectedLocalChange: "确认真相",
      }]);
    } finally {
      database.close();
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
        mappings: [{ nodeId, segmentIntent: "本章夜探", expectedLocalChange: "从侧门离开" }],
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
