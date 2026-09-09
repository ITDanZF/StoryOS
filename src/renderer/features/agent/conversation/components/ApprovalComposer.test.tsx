import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ToolCallNode } from "../model/conversationNode.ts";
import ToolCallNodeView from "../nodes/ToolCallNodeView.tsx";
import ApprovalComposer from "./ApprovalComposer.tsx";

describe("approval composer placement", () => {
  it("renders approval actions only in the composer, not in the tool row", () => {
    const tool: ToolCallNode = {
      key: "tool:run-1:call-1",
      kind: "tool-call",
      runId: "run-1",
      anchorSequence: 1,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      state: "running",
      toolCallId: "call-1",
      toolName: "update_book_chapter",
      summary: "修改第八章",
      status: "awaiting_approval",
    };

    const toolMarkup = renderToStaticMarkup(<ToolCallNodeView node={tool} />);
    expect(toolMarkup).not.toContain("允许一次");
    expect(toolMarkup).not.toContain("本次会话允许");

    const composerMarkup = renderToStaticMarkup(
      <ApprovalComposer
        approval={{
          approvalId: "approval-1",
          runId: "run-1",
          threadId: "thread-1",
          conversationScope: { kind: "global" },
          toolName: "update_book_chapter",
          summary: "修改第八章",
          preview: "更新章节标题",
          requestedAt: new Date(0).toISOString(),
        }}
        onResolve={vi.fn()}
      />,
    );
    expect(composerMarkup).toContain("等待你的确认");
    expect(composerMarkup).toContain("允许一次");
    expect(composerMarkup).toContain("本次会话允许");
  });
});
