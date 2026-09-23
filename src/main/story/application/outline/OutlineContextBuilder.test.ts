import { describe, expect, it } from "vitest";
import type { OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { NovelVectorQueryError } from "../vectors/searchNovelVectors.ts";
import SqliteOutlineStore from "../../storage/book/SqliteOutlineStore.ts";
import { OutlineContextTooLarge } from "./outlineErrors.ts";
import { buildChapterInstruction } from "./OutlineContextBuilder.ts";
import OutlineApplication from "./OutlineApplication.ts";
import { eventNode, openOutlineBook } from "./outlineFixture.ts";

function snapshot(): OutlineSnapshot {
  const node = (
    id: string,
    title: string,
    narrativeOrder: number,
    status: OutlineSnapshot["nodes"][number]["status"] = "confirmed",
  ): OutlineSnapshot["nodes"][number] => ({
    id,
    outlineId: "outline-1",
    parentId: null,
    kind: "event",
    title,
    summary: `${title}摘要`,
    structuralRole: "rising_action",
    narrativeFunction: "action",
    goal: `${title}目标`,
    conflict: `${title}冲突`,
    outcome: `${title}结果`,
    locationText: "城门",
    timeText: "夜里",
    storyOrder: narrativeOrder,
    narrativeOrder,
    status,
    notes: "",
    revision: 1,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  });
  return {
    outline: {
      id: "outline-1",
      novelId: "book-1",
      title: "总纲",
      premise: "",
      theme: "主题",
      coreConflict: "核心冲突",
      climaxSummary: "",
      endingIntent: "结局",
      status: "active",
      revision: 3,
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
    },
    nodes: [node("current", "夜探", 1000), node("next", "天亮", 2000), node("draft", "草拟", 3000, "draft")],
    relations: [],
    mappings: [
      {
        chapterId: "chapter-1",
        nodeId: "current",
        sortOrder: 1000,
        coverageStatus: "planned",
        coverageNote: "",
        verificationOutlineRevision: null,
        verificationChapterRevisionId: null,
      },
      {
        chapterId: "chapter-1",
        nodeId: "next",
        sortOrder: 2000,
        coverageStatus: "planned",
        coverageNote: "",
        verificationOutlineRevision: null,
        verificationChapterRevisionId: null,
      },
      {
        chapterId: "chapter-2",
        nodeId: "draft",
        sortOrder: 3000,
        coverageStatus: "planned",
        coverageNote: "",
        verificationOutlineRevision: null,
        verificationChapterRevisionId: null,
      },
    ],
    participants: [
      {
        nodeId: "current",
        participantName: "阿青",
        role: "active",
        stateBefore: "在城外",
        stateAfter: "进了城",
      },
    ],
    promises: [
      {
        id: "planned",
        outlineId: "outline-1",
        title: "未触发",
        setup: "只是计划",
        triggerCondition: "以后",
        payoffRequirement: "不要出现",
        status: "planned",
        setupNodeId: "current",
        triggerNodeId: "current",
        payoffNodeId: null,
        notes: "",
        statusReason: "",
        revision: 1,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
      {
        id: "later",
        outlineId: "outline-1",
        title: "后章承诺",
        setup: "后章",
        triggerCondition: "后章才触发",
        payoffRequirement: "后章兑现",
        status: "eligible",
        setupNodeId: "draft",
        triggerNodeId: "draft",
        payoffNodeId: null,
        notes: "",
        statusReason: "已经可兑现",
        revision: 1,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
      {
        id: "now",
        outlineId: "outline-1",
        title: "本章承诺",
        setup: "本章",
        triggerCondition: "本章触发",
        payoffRequirement: "本章要处理",
        status: "eligible",
        setupNodeId: "current",
        triggerNodeId: "current",
        payoffNodeId: null,
        notes: "",
        statusReason: "已经可兑现",
        revision: 1,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    issues: [],
  };
}

const chapters = [
  { id: "chapter-1", title: "第一章", index: 0 },
  { id: "chapter-2", title: "第二章", index: 1 },
];

describe("outline context", () => {
  it("marks the next leaf as transition-only and omits promises that are not yet triggered", () => {
    const context = buildChapterInstruction({
      snapshot: snapshot(),
      chapterId: "chapter-1",
      selection: ["current"],
      chapters,
      evidence: [],
    });
    expect(context.instruction).toContain("只用于过渡，不得展开");
    expect(context.instruction).toContain("天亮");
    expect(context.instruction).toContain("本章要处理");
    expect(context.instruction).not.toContain("不要出现");
    expect(context.instruction).not.toContain("后章兑现");
    expect(context.instruction).toContain("没有命中");
  });

  it("keeps hard constraints and drops evidence content when the budget is exceeded", () => {
    const context = buildChapterInstruction({
      snapshot: snapshot(),
      chapterId: "chapter-1",
      selection: ["current"],
      chapters,
      evidence: [
        {
          chapterId: "chapter-1",
          revisionId: "revision-1",
          startOffset: 0,
          endOffset: 12,
          content: "证".repeat(5000),
        },
      ],
    });
    expect(context.instruction).toContain("核心冲突");
    expect(context.instruction).toContain("夜探目标");
    expect(context.instruction).not.toContain("证".repeat(100));
    expect(context.instruction).toContain("revision-1");
    expect(context.instruction).toContain("0-12");
    expect(context.omittedSections).toContain("evidence-content");
    expect(context.usedCharacters).toBeLessThanOrEqual(4000);
  });

  it("refuses to truncate a hard constraint that does not fit", () => {
    const current = snapshot();
    expect(() =>
      buildChapterInstruction({
        snapshot: {
          ...current,
          outline: { ...current.outline, coreConflict: "冲".repeat(4000) },
        },
        chapterId: "chapter-1",
        selection: ["current"],
        chapters,
        evidence: [],
      }),
    ).toThrow(OutlineContextTooLarge);
  });

  it("rethrows a vector query error without rewriting it", async () => {
    const book = openOutlineBook();
    try {
      const outline = new OutlineApplication(new SqliteOutlineStore(book.database.handle), {
        model: null,
        retrieveEvidence: async () => {
          throw new NovelVectorQueryError("Novel vector index does not exist.");
        },
      });
      const created = outline.createOutline({
        projectId: book.projectId,
        title: "总纲",
        premise: "",
        theme: "主题",
        coreConflict: "冲突",
        climaxSummary: "",
        endingIntent: "结局",
      });
      const applied = outline.applyOutlinePatch({
        projectId: book.projectId,
        patch: {
          outlineId: created.outline.id,
          expectedRevision: 1,
          operations: [{ type: "create_node", tempId: "temp-leaf", value: eventNode() }],
        },
      });
      const nodeId = applied.snapshot.nodes[0]?.id;
      if (!nodeId) throw new Error("node missing");
      outline.mapOutlineNodes({
        projectId: book.projectId,
        expectedRevision: applied.snapshot.outline.revision,
        chapterId: book.chapterId,
        nodeIds: [nodeId],
      });
      await expect(
        outline.buildChapterContext({
          projectId: book.projectId,
          chapterId: book.chapterId,
          selection: [],
        }),
      ).rejects.toThrow("Novel vector index does not exist.");
    } finally {
      book.close();
    }
  });
});
