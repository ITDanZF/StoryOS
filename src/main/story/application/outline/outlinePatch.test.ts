import { afterEach, describe, expect, it } from "vitest";
import type { OutlinePatch, OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import SqliteOutlineStore from "../../storage/book/SqliteOutlineStore.ts";
import OutlineApplication from "./OutlineApplication.ts";
import { OutlineRevisionConflict, OutlineValidationError } from "./outlineErrors.ts";
import { eventNode, openOutlineBook, type OutlineBook } from "./outlineFixture.ts";

const books: OutlineBook[] = [];

afterEach(() => {
  for (const book of books.splice(0)) book.close();
});

function application(): { book: OutlineBook; outline: OutlineApplication } {
  const book = openOutlineBook();
  books.push(book);
  return {
    book,
    outline: new OutlineApplication(new SqliteOutlineStore(book.database.handle), { model: null }),
  };
}

function createActive(outline: OutlineApplication, projectId: string): OutlineSnapshot {
  return outline.createOutline({
    projectId,
    title: "总纲",
    premise: "前提",
    theme: "主题",
    coreConflict: "冲突",
    climaxSummary: "高潮",
    endingIntent: "结局",
  });
}

describe("outline patch", () => {
  it("returns null when the book has no outline and does not insert a row", () => {
    const { book, outline } = application();
    expect(outline.getOutlineSnapshot(book.projectId)).toBeNull();
    expect(book.database.handle.prepare("SELECT COUNT(*) AS count FROM outlines").get()).toEqual({
      count: 0,
    });
  });

  it("rejects a revision conflict without writing", () => {
    const { book, outline } = application();
    const created = createActive(outline, book.projectId);
    expect(() =>
      outline.applyOutlinePatch({
        projectId: book.projectId,
        patch: {
          outlineId: created.outline.id,
          expectedRevision: created.outline.revision + 3,
          operations: [{ type: "create_node", tempId: "temp-1", value: eventNode() }],
        },
      }),
    ).toThrow(OutlineRevisionConflict);
    expect(outline.getOutlineSnapshot(book.projectId)?.outline.revision).toBe(1);
    expect(outline.getOutlineSnapshot(book.projectId)?.nodes).toEqual([]);
  });

  it("replaces temporary ids and rolls back the whole batch", () => {
    const { book, outline } = application();
    const created = createActive(outline, book.projectId);
    const applied = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: 1,
        operations: [{ type: "create_node", tempId: "temp-1", value: eventNode() }],
      },
    });
    expect(applied.affectedNodeIds).toHaveLength(1);
    expect(applied.affectedNodeIds[0]).not.toBe("temp-1");
    expect(applied.snapshot.nodes.map((node) => node.id)).not.toContain("temp-1");

    const parentId = applied.snapshot.nodes[0]?.id;
    if (!parentId) throw new Error("node missing");
    const failing: OutlinePatch = {
      outlineId: created.outline.id,
      expectedRevision: applied.snapshot.outline.revision,
      operations: [
        { type: "create_node", tempId: "temp-child", value: eventNode({ parentId, title: "子事件" }) },
        {
          type: "upsert_relation",
          value: {
            sourceNodeId: "temp-child",
            targetNodeId: "temp-child",
            type: "causes",
            description: "自己指向自己",
            orderException: false,
          },
        },
      ],
    };
    expect(() => outline.applyOutlinePatch({ projectId: book.projectId, patch: failing })).toThrow(
      OutlineValidationError,
    );
    const after = outline.getOutlineSnapshot(book.projectId);
    expect(after?.nodes).toHaveLength(1);
    expect(after?.outline.revision).toBe(applied.snapshot.outline.revision);
  });

  it("rejects a parent cycle, a cross-outline promise, and a promise without reason", () => {
    const { book, outline } = application();
    const created = createActive(outline, book.projectId);
    const parent = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: 1,
        operations: [
          { type: "create_node", tempId: "parent", value: eventNode({ title: "父事件" }) },
          {
            type: "create_node",
            tempId: "child",
            value: eventNode({ parentId: "parent", title: "子事件", narrativeOrder: 2000, storyOrder: 2000 }),
          },
        ],
      },
    });
    const parentId = parent.snapshot.nodes.find((node) => node.title === "父事件")?.id;
    const childId = parent.snapshot.nodes.find((node) => node.title === "子事件")?.id;
    if (!parentId || !childId) throw new Error("nodes missing");
    expect(() =>
      outline.applyOutlinePatch({
        projectId: book.projectId,
        patch: {
          outlineId: created.outline.id,
          expectedRevision: parent.snapshot.outline.revision,
          operations: [{ type: "move_node", nodeId: parentId, parentId: childId, order: 3000 }],
        },
      }),
    ).toThrow(/父子成环/);

    const foreignId = "foreign-node";
    book.database.handle
      .prepare(
        `INSERT INTO outlines(
          id, book_id, title, premise, theme, core_conflict, climax_summary, ending_intent, status, revision, created_at, updated_at
        ) VALUES ('other-outline', ?, '另一份', '', '', '', '', '', 'draft', 1, 1, 1)`,
      )
      .run(book.bookId);
    book.database.handle
      .prepare(
        `INSERT INTO outline_nodes(
          id, outline_id, parent_id, kind, title, summary, structural_role, narrative_function,
          goal, conflict, outcome, location_text, time_text, story_order, narrative_order,
          status, notes, revision, created_at, updated_at
        ) VALUES (?, 'other-outline', NULL, 'event', '外', '', 'setup', 'action', '', '', '', '', '', 1, 1, 'draft', '', 1, 1, 1)`,
      )
      .run(foreignId);
    const revision = outline.getOutlineSnapshot(book.projectId)?.outline.revision;
    expect(() =>
      outline.applyOutlinePatch({
        projectId: book.projectId,
        patch: {
          outlineId: created.outline.id,
          expectedRevision: revision ?? 0,
          operations: [
            {
              type: "upsert_promise",
              value: {
                title: "信",
                setup: "铺设",
                triggerCondition: "见到人",
                payoffRequirement: "交出信",
                status: "planned",
                setupNodeId: foreignId,
                triggerNodeId: null,
                payoffNodeId: null,
                notes: "",
                reason: "",
              },
            },
          ],
        },
      }),
    ).toThrow(/承诺跨大纲/);
    expect(() =>
      outline.applyOutlinePatch({
        projectId: book.projectId,
        patch: {
          outlineId: created.outline.id,
          expectedRevision: revision ?? 0,
          operations: [
            {
              type: "upsert_promise",
              value: {
                title: "信",
                setup: "铺设",
                triggerCondition: "见到人",
                payoffRequirement: "交出信",
                status: "eligible",
                setupNodeId: parentId,
                triggerNodeId: null,
                payoffNodeId: null,
                notes: "",
                reason: "  ",
              },
            },
          ],
        },
      }),
    ).toThrow(/承诺缺少 reason/);
    expect(outline.getOutlineSnapshot(book.projectId)?.promises).toEqual([]);
    expect(outline.getOutlineSnapshot(book.projectId)?.outline.revision).toBe(revision);
  });

  it("commits when the only new issues are warnings", () => {
    const { book, outline } = application();
    const created = createActive(outline, book.projectId);
    const applied = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: 1,
        operations: [
          { type: "create_node", tempId: "later", value: eventNode({ title: "后发生", narrativeOrder: 2000, storyOrder: 2000 }) },
          { type: "create_node", tempId: "earlier", value: eventNode({ title: "先发生", narrativeOrder: 1000, storyOrder: 1000 }) },
          {
            type: "upsert_relation",
            value: {
              sourceNodeId: "later",
              targetNodeId: "earlier",
              type: "causes",
              description: "倒叙",
              orderException: false,
            },
          },
        ],
      },
    });
    expect(applied.snapshot.outline.revision).toBe(2);
    expect(applied.snapshot.issues.some((issue) => issue.ruleCode === "relation.order" && issue.severity === "warning")).toBe(
      true,
    );
    expect(applied.snapshot.issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("previews a deletion without writing and clears promise links on commit", () => {
    const { book, outline } = application();
    const created = createActive(outline, book.projectId);
    const seeded = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: 1,
        operations: [
          { type: "create_node", tempId: "parent", value: eventNode({ title: "父事件", status: "draft" }) },
          {
            type: "create_node",
            tempId: "child",
            value: eventNode({ parentId: "parent", title: "子事件", narrativeOrder: 2000, storyOrder: 2000 }),
          },
        ],
      },
    });
    const parentId = seeded.snapshot.nodes.find((node) => node.title === "父事件")?.id;
    const childId = seeded.snapshot.nodes.find((node) => node.title === "子事件")?.id;
    if (!parentId || !childId) throw new Error("nodes missing");
    outline.mapOutlineNodes({
      projectId: book.projectId,
      expectedRevision: seeded.snapshot.outline.revision,
      chapterId: book.chapterId,
      nodeIds: [childId],
    });
    const withPromise = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: seeded.snapshot.outline.revision + 1,
        operations: [
          {
            type: "upsert_relation",
            value: {
              sourceNodeId: parentId,
              targetNodeId: childId,
              type: "causes",
              description: "引出",
              orderException: false,
            },
          },
          {
            type: "upsert_promise",
            value: {
              title: "信",
              setup: "铺设",
              triggerCondition: "见到人",
              payoffRequirement: "交出信",
              status: "seeded",
              setupNodeId: childId,
              triggerNodeId: null,
              payoffNodeId: null,
              notes: "",
              reason: "",
            },
          },
        ],
      },
    });
    const before = withPromise.snapshot.outline.revision;
    const preview = outline.previewOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: before,
        operations: [{ type: "delete_node", nodeId: parentId }],
      },
    });
    expect(preview.childNodeIds).toEqual([childId]);
    expect(preview.relationIds).toHaveLength(1);
    expect(preview.mappings).toEqual([{ nodeId: childId, chapterId: book.chapterId }]);
    expect(preview.promiseIds).toHaveLength(1);
    expect(outline.getOutlineSnapshot(book.projectId)?.outline.revision).toBe(before);
    const deleted = outline.applyOutlinePatch({
      projectId: book.projectId,
      patch: {
        outlineId: created.outline.id,
        expectedRevision: before,
        operations: [{ type: "delete_node", nodeId: parentId }],
      },
    });
    expect(deleted.snapshot.nodes).toEqual([]);
    expect(deleted.snapshot.promises[0]?.setupNodeId).toBeNull();
    expect(deleted.snapshot.issues.some((issue) => issue.ruleCode === "promise.node_deleted")).toBe(true);
    expect(
      book.database.handle.prepare("SELECT title FROM chapters WHERE id = ?").get(book.chapterId),
    ).toEqual({ title: "第一章" });
  });
});
