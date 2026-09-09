import { describe, expect, it } from "vitest";
import type { ToolCallNode } from "../model/conversationNode.ts";
import { getToolPresentation } from "./toolPresenterRegistry.ts";

function tool(overrides: Partial<ToolCallNode> = {}): ToolCallNode {
  return {
    key: "tool:run-1:call-1",
    kind: "tool-call",
    runId: "run-1",
    toolCallId: "call-1",
    toolName: "read_book_chapter",
    summary: "Execute read_book_chapter: chapter_internal_id",
    status: "completed",
    anchorSequence: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    state: "settled",
    ...overrides,
  };
}

describe("tool presenter registry", () => {
  it("replaces internal summaries with business language", () => {
    expect(getToolPresentation(tool())).toEqual({
      label: "读取",
      summary: "已读取章节正文",
    });
  });

  it("uses status-specific copy", () => {
    expect(getToolPresentation(tool({ status: "running", state: "running" })).summary)
      .toBe("正在读取章节正文");
    expect(getToolPresentation(tool({ status: "awaiting_approval", state: "running" })).summary)
      .toBe("等待确认");
    expect(getToolPresentation(tool({ status: "failed", state: "failed" })).summary)
      .toBe("执行失败");
  });

  it("does not expose the raw summary for unknown tools", () => {
    expect(getToolPresentation(tool({ toolName: "custom_tool" }))).toEqual({
      label: "执行",
      summary: "已完成",
    });
  });
});
