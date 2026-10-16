import { describe, expect, it } from "vitest";
import { ancestorArcId, isMainlineCard, moveSpineItem, narrativeJump, spineBlocks, spineLanes, type SpineItem } from "./spine.ts";

function item(
  id: string,
  storyOrder: number,
  narrativeOrder: number,
  parentId: string | null,
  kind: SpineItem["kind"] = "event",
): SpineItem {
  return {
    id,
    title: id,
    changeBefore: "",
    changeAfter: "",
    storyOrder,
    narrativeOrder,
    parentId,
    chapterId: null,
    proposal: false,
    kind,
    summary: "",
    status: "draft",
    participants: [],
  };
}

describe("event graph spine", () => {
  it("marks a backward story jump as flashback and a skipped story jump as flashforward", () => {
    expect(narrativeJump(null, 4)).toBeNull();
    expect(narrativeJump(5, 8)).toBe("预叙");
    expect(narrativeJump(8, 0)).toBe("倒叙");
    expect(narrativeJump(0, 1)).toBeNull();
  });

  it("groups consecutive events under the arc the reader has reached", () => {
    const blocks = spineBlocks([
      item("gun", 4, 0, "ambush"),
      item("cover", 5, 1, "ambush"),
      item("shell", 8, 2, "ridge"),
      item("blade", 0, 3, "rescue"),
    ], new Map([["ambush", "北坡遇伏"], ["ridge", "山脊揭穿"], ["rescue", "二十年互救"]]));
    expect(blocks.map((block) => [block.arcTitle, block.rows.map((row) => `${row.reading}:${row.id}:${row.jump ?? ""}`)])).toEqual([
      ["北坡遇伏", ["1:gun:", "2:cover:"]],
      ["山脊揭穿", ["3:shell:预叙"]],
      ["二十年互救", ["4:blade:倒叙"]],
    ]);
  });

  it("keeps events as cards and turns a scene into a frame once it has events", () => {
    const scene = item("camp", 0, 0, "arc", "scene");
    const event = item("whistle", 1, 1, "camp");
    const loneScene = item("ridge", 2, 2, "arc", "scene");
    const arc = { ...item("arc", 0, 0, null, "arc"), title: "交出铜哨" };
    const nodes = [arc, scene, event, loneScene];
    expect(nodes.filter((node) => isMainlineCard(node, nodes)).map((node) => node.id)).toEqual(["whistle", "ridge"]);
    expect(ancestorArcId("whistle", nodes)).toBe("arc");
    expect(spineLanes(nodes).map((lane) => lane.title)).toEqual(["交出铜哨"]);
  });

  it("moves a beat to the drop position in reading order", () => {
    expect(moveSpineItem(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveSpineItem(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
});
