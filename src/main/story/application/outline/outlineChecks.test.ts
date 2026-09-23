import { describe, expect, it } from "vitest";
import type { OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { collectOutlineIssues, issueIsStale } from "./outlineChecks.ts";
import { readCoverageIssues, readSemanticIssues } from "./outlineReview.ts";

function snapshot(): OutlineSnapshot {
  return {
    outline: {
      id: "outline-1",
      novelId: "book-1",
      title: "总纲",
      premise: "",
      theme: "主题",
      coreConflict: "冲突",
      climaxSummary: "",
      endingIntent: "结局",
      status: "active",
      revision: 2,
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
    },
    nodes: [
      {
        id: "later",
        outlineId: "outline-1",
        parentId: null,
        kind: "event",
        title: "后发生",
        summary: "",
        structuralRole: "rising_action",
        narrativeFunction: "action",
        goal: "",
        conflict: "",
        outcome: "",
        locationText: "城门",
        timeText: "",
        storyOrder: 2,
        narrativeOrder: 2000,
        status: "confirmed",
        notes: "",
        revision: 1,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
      {
        id: "earlier",
        outlineId: "outline-1",
        parentId: null,
        kind: "event",
        title: "先发生",
        summary: "",
        structuralRole: "setup",
        narrativeFunction: "action",
        goal: "目标",
        conflict: "冲突",
        outcome: "",
        locationText: "城外",
        timeText: "",
        storyOrder: 1,
        narrativeOrder: 1000,
        status: "confirmed",
        notes: "",
        revision: 4,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    relations: [
      {
        id: "relation-1",
        outlineId: "outline-1",
        sourceNodeId: "later",
        targetNodeId: "earlier",
        type: "causes",
        description: "倒因为果",
        orderException: false,
        createdAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    mappings: [],
    participants: [],
    promises: [
      {
        id: "promise-1",
        outlineId: "outline-1",
        title: "信",
        setup: "铺设",
        triggerCondition: "见面",
        payoffRequirement: "交出",
        status: "seeded",
        setupNodeId: "later",
        triggerNodeId: null,
        payoffNodeId: "earlier",
        notes: "",
        statusReason: "",
        revision: 1,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    issues: [],
  };
}

describe("outline checks", () => {
  it("warns about reversed order, an early payoff, and an unmapped leaf", () => {
    const issues = collectOutlineIssues(snapshot());
    expect(issues.find((issue) => issue.ruleCode === "relation.order")?.severity).toBe("warning");
    expect(issues.find((issue) => issue.ruleCode === "promise.payoff_before_setup")?.severity).toBe("warning");
    expect(issues.filter((issue) => issue.ruleCode === "node.unmapped_leaf").map((issue) => issue.severity)).toEqual([
      "info",
      "info",
    ]);
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("marks a coverage fingerprint stale when the recorded revision no longer matches", () => {
    const current = snapshot();
    const issue = {
      id: "issue-1",
      outlineId: current.outline.id,
      nodeId: "earlier",
      ruleCode: "coverage.revision_drift",
      severity: "warning" as const,
      source: "rule" as const,
      message: "覆盖所依据的章节修订已不是当前修订",
      fingerprint: ["coverage.revision_drift", "earlier", "4", "1", "old-revision"].join("\u001f"),
      status: "open" as const,
      checkedRevision: 4,
      stale: false,
    };
    expect(
      issueIsStale(issue, current, new Map([["chapter-1", "new-revision"]])),
    ).toBe(true);
    const fresh = {
      ...issue,
      fingerprint: ["coverage.revision_drift", "earlier", "4", "2", "new-revision"].join("\u001f"),
    };
    const mapped: OutlineSnapshot = {
      ...current,
      mappings: [
        {
          chapterId: "chapter-1",
          nodeId: "earlier",
          sortOrder: 1000,
          coverageStatus: "planned",
          coverageNote: "",
          verificationOutlineRevision: 2,
          verificationChapterRevisionId: "new-revision",
        },
      ],
    };
    expect(issueIsStale(fresh, mapped, new Map([["chapter-1", "new-revision"]]))).toBe(false);
  });

  it("keeps semantic suggestions distinct from structural errors and locates coverage to a leaf", () => {
    const current = snapshot();
    const semantic = readSemanticIssues(
      JSON.stringify({
        issues: [{ nodeId: "earlier", message: "主题混淆", evidence: "目标偏了", severity: "warning" }],
      }),
      current,
      () => "issue-semantic",
      "",
    );
    expect(semantic[0]).toMatchObject({
      source: "ai",
      ruleCode: "semantic.suggestion",
      severity: "warning",
      nodeId: "earlier",
    });
    expect(() =>
      readSemanticIssues(
        JSON.stringify({
          issues: [{ nodeId: "earlier", message: "坏了", evidence: "证据", severity: "error" }],
        }),
        current,
        () => "issue-bad",
        "",
      ),
    ).toThrow(/语义检查输出无法解析/);
    const coverage = readCoverageIssues(
      JSON.stringify({
        issues: [{ nodeId: "earlier", verdict: "missing", evidence: "正文没有找信" }],
      }),
      current,
      "revision-1",
      () => "issue-coverage",
    );
    expect(coverage[0]).toMatchObject({ nodeId: "earlier", source: "ai", message: "未出现：正文没有找信" });
  });
});
