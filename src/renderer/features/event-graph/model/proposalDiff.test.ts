import { describe, expect, it } from "vitest";
import type { OutlinePatch, OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { editProposalText, readProposal } from "./proposalDiff.ts";

const snapshot = {
  outline: { id: "outline-1", revision: 3 },
  nodes: [
    { id: "arc", title: "开端", goal: "旧目标", conflict: "旧冲突", outcome: "旧结果", summary: "" },
  ],
  mappings: [{ nodeId: "arc", chapterId: "chapter-1" }],
} as unknown as OutlineSnapshot;

function patch(operations: OutlinePatch["operations"]): OutlinePatch {
  return { outlineId: "outline-1", expectedRevision: 3, operations };
}

describe("proposal diff", () => {
  it("lists a new node's goal, conflict, and outcome", () => {
    const reading = readProposal(snapshot, patch([{
      type: "create_node",
      tempId: "temp-1",
      value: {
        parentId: null,
        kind: "event",
        title: "发现证据",
        summary: "",
        structuralRole: "turning_point",
        narrativeFunction: "action",
        goal: "找到信",
        conflict: "看守阻拦",
        outcome: "主角拿到信",
        locationText: "",
        timeText: "",
        storyOrder: 1,
        narrativeOrder: 1,
        status: "draft",
        notes: "",
        participants: [],
      },
    }]), []);
    expect(reading.unnamedCount).toBe(0);
    expect(reading.entries[0]).toMatchObject({ kind: "create", title: "发现证据", editable: true });
    expect(reading.entries[0]?.lines).toEqual(["目标：找到信", "冲突：看守阻拦", "结果：主角拿到信"]);
  });

  it("marks updates to nodes the author did not name", () => {
    const reading = readProposal(snapshot, patch([{
      type: "update_node",
      nodeId: "arc",
      changes: { outcome: "新结果" },
    }]), []);
    expect(reading.unnamedCount).toBe(1);
    expect(reading.entries[0]?.lines).toEqual(["结果：旧结果 → 新结果"]);
    expect(reading.affectedChapters).toEqual([{ chapterId: "chapter-1", nodeTitle: "开端" }]);
  });

  it("allows an update when the node was named", () => {
    const reading = readProposal(snapshot, patch([{
      type: "update_node",
      nodeId: "arc",
      changes: { goal: "新目标" },
    }]), ["arc"]);
    expect(reading.unnamedCount).toBe(0);
  });

  it("edits candidate text before accept", () => {
    const original = patch([{
      type: "create_node",
      tempId: "temp-1",
      value: {
        parentId: null,
        kind: "event",
        title: "发现证据",
        summary: "",
        structuralRole: "custom",
        narrativeFunction: "mixed",
        goal: "找到信",
        conflict: "",
        outcome: "",
        locationText: "",
        timeText: "",
        storyOrder: 0,
        narrativeOrder: 0,
        status: "draft",
        notes: "",
        participants: [],
      },
    }]);
    const edited = editProposalText(original, 0, "outcome", "同伴先发现");
    expect(edited?.operations[0]).toMatchObject({ type: "create_node", value: { outcome: "同伴先发现" } });
    expect(editProposalText(original, 3, "title", "无")).toBeNull();
  });
});
