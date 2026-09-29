import { describe, expect, it } from "vitest";
import { renderOutlineProposalPrompt } from "./outlinePropose.ts";

describe("outline proposal prompt", () => {
  it("keeps the author's words and the named nodes", () => {
    const prompt = renderOutlineProposalPrompt(null, null, "sequential", "河边重逢", []);
    expect(prompt).toContain("作者要求：河边重逢");
    expect(prompt).not.toContain("作者点名了这些节点");
  });
});
