import { describe, expect, it } from "vitest";
import type { OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import {
  acceptedLeaves,
  chapterMainline,
  coverageFreshness,
  deviationImpact,
  deleteImpact,
  handoffGaps,
  nextTransitionLeaf,
} from "./chapterMainline.ts";

function snapshot(revision = 2): OutlineSnapshot {
  return {
    outline: { id: "outline-1", revision },
    nodes: [
      { id: "parent", parentId: null, title: "弧", status: "confirmed", goal: "", conflict: "", outcome: "", narrativeOrder: 0 },
      { id: "leaf-a", parentId: "parent", title: "发现证据", status: "confirmed", goal: "找到信", conflict: "看守", outcome: "拿到信", narrativeOrder: 1 },
      { id: "leaf-b", parentId: "parent", title: "对质", status: "writing", goal: "问出口", conflict: "否认", outcome: "承认", narrativeOrder: 2 },
      { id: "leaf-c", parentId: "parent", title: "下一章", status: "confirmed", goal: "离开", conflict: "", outcome: "出走", narrativeOrder: 3 },
      { id: "draft", parentId: "parent", title: "草稿", status: "draft", goal: "", conflict: "", outcome: "", narrativeOrder: 4 },
    ],
    mappings: [
      { nodeId: "leaf-a", chapterId: "c1", coverageStatus: "verified", verificationOutlineRevision: 2, verificationChapterRevisionId: "rev-1" },
      { nodeId: "leaf-b", chapterId: "c1", coverageStatus: "drafted", verificationOutlineRevision: 2, verificationChapterRevisionId: "rev-1" },
      { nodeId: "leaf-c", chapterId: "c2", coverageStatus: "planned", verificationOutlineRevision: null, verificationChapterRevisionId: null },
      { nodeId: "draft", chapterId: "c1", coverageStatus: "planned", verificationOutlineRevision: null, verificationChapterRevisionId: null },
    ],
    relations: [{ sourceNodeId: "leaf-a", targetNodeId: "leaf-b" }],
    promises: [{ title: "信的主人", setupNodeId: "leaf-a", triggerNodeId: null, payoffNodeId: "leaf-c" }],
  } as unknown as OutlineSnapshot;
}

describe("chapter mainline", () => {
  it("keeps confirmed and in-progress leaves for the selected chapter", () => {
    expect(acceptedLeaves(snapshot(), "c1").map((node) => node.id)).toEqual(["leaf-a", "leaf-b"]);
  });

  it("shows pending verification and expires it when the chapter revision changes", () => {
    const current = chapterMainline(snapshot(), "c1", "rev-1");
    expect(current.map((leaf) => [leaf.title, leaf.label])).toEqual([
      ["发现证据", "已覆盖"],
      ["对质", "待核验"],
      ["草稿", "草稿"],
    ]);
    const stale = chapterMainline(snapshot(), "c1", "rev-2");
    expect(stale.find((leaf) => leaf.id === "leaf-b")?.label).toBe("需要重新核对");
  });

  it("marks a covered conclusion stale after the outline revision moves", () => {
    expect(coverageFreshness(2, "rev-1", 3, "rev-1")).toBe("stale");
    expect(coverageFreshness(null, null, 3, "rev-1")).toBe("unchecked");
    expect(coverageFreshness(3, "rev-1", 3, "rev-1")).toBe("current");
  });

  it("uses the following leaf only as a transition", () => {
    expect(nextTransitionLeaf(snapshot(), ["leaf-a"])?.id).toBe("leaf-b");
  });

  it("explains why a chapter cannot be written yet", () => {
    expect(handoffGaps(null, "c1")).toEqual(["这本书还没有事件图。"]);
    expect(handoffGaps(snapshot(), "missing")).toEqual(["这一章还没有叶子事件。"]);
    expect(handoffGaps(snapshot(), "c1").some((line) => line.includes("草稿"))).toBe(true);
  });

  it("lists chapters, relations, and promises touched by a deletion", () => {
    expect(deleteImpact(snapshot(), "leaf-a")).toEqual({
      title: "发现证据",
      chapters: ["c1"],
      relationCount: 1,
      promises: ["信的主人"],
    });
  });

  it("identifies direct successors and promises after a written event deviates", () => {
    const impact = deviationImpact(snapshot(), "leaf-a");
    expect(impact.nextLeaf?.id).toBe("leaf-b");
    expect(impact.relatedNodes.map((node) => node.id)).toEqual(["leaf-b", "leaf-c"]);
    expect(impact.promises).toEqual(["信的主人"]);
  });
});
