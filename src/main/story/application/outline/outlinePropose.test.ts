import { describe, expect, it } from "vitest";
import { readProposalOperations, renderOutlineProposalPrompt } from "./outlinePropose.ts";
import { eventNode } from "./outlineFixture.ts";
import type { OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";

describe("outline proposal prompt", () => {
  it("keeps the author's words and the named nodes", () => {
    const prompt = renderOutlineProposalPrompt(null, null, "sequential", "河边重逢", []);
    expect(prompt).toContain("作者要求：河边重逢");
    expect(prompt).not.toContain("作者点名了这些节点");
  });

  it("uses the saved story premise and climax when proposing a mainline", () => {
    const outline = {
      outline: { title: "山中来信", premise: "主角必须找到失踪的弟弟", theme: "信任", coreConflict: "家族阻拦", climaxSummary: "公开真相", endingIntent: "和解" },
      nodes: [], relations: [],
    } as unknown as OutlineSnapshot;
    const prompt = renderOutlineProposalPrompt(outline, null, "climax-first");
    expect(prompt).toContain("故事构思 主角必须找到失踪的弟弟");
    expect(prompt).toContain("高潮 公开真相");
  });

  it("rejects a generated node without the required parent reference", () => {
    const withoutParent = { ...eventNode() };
    Reflect.deleteProperty(withoutParent, "parentId");
    const result = readProposalOperations(JSON.stringify({
      summary: "补一层",
      operations: [{ type: "create_node", tempId: "temp-1", value: withoutParent }],
    }));
    expect(result).toHaveProperty("problems");
  });
});
