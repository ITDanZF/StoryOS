import { describe, expect, it } from "vitest";
import { buildEventBrief, type DetailRelation } from "./eventBrief.ts";
import type { SpineItem } from "./spine.ts";

function card(id: string, reading: number, storyOrder: number): SpineItem & { reading: number } {
  return {
    id,
    title: id,
    changeBefore: "",
    changeAfter: `${id}之后`,
    storyOrder,
    narrativeOrder: reading - 1,
    parentId: null,
    chapterId: null,
    proposal: false,
    kind: "event",
    summary: "",
    status: "confirmed",
    participants: [{ name: "沈衡", role: "经历者", kind: "人", stateBefore: "信任", stateAfter: "怀疑" }],
    reading,
  };
}

describe("event brief", () => {
  it("keeps the next beat as transition context and attaches only this event's constraints", () => {
    const gun = card("gun", 1, 4);
    const cover = card("cover", 2, 5);
    const relations: DetailRelation[] = [
      { id: "cause", from: "whistle", to: "gun", type: "causes", description: "口令导致枪声" },
      { id: "other", from: "cover", to: "name", type: "contrasts", description: "称呼变了" },
    ];
    const brief = buildEventBrief(gun, [gun, cover], relations, new Map([["whistle", "交出铜哨"]]), "第1章");
    expect(brief.statusLabel).toBe("已确认");
    expect(brief.jump).toBeNull();
    expect(brief.next).toEqual({ title: "cover", changeAfter: "cover之后" });
    expect(brief.constraints).toEqual([
      expect.objectContaining({ direction: "in", typeLabel: "因果", otherTitle: "交出铜哨", description: "口令导致枪声" }),
    ]);
    expect(brief.participants).toEqual([{ name: "沈衡", role: "经历者", kind: "人", before: "信任", after: "怀疑" }]);
  });
});
