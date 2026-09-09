import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "./conversationEvent.ts";
import {
  applyConversationEvent,
  assembleConversation,
} from "./conversationAssembler.ts";
import { createEmptyConversationProjection } from "./conversationNode.ts";

const common = {
  threadId: "thread-1",
  runId: "run-1",
  timestamp: new Date(0).toISOString(),
};

function events(...items: readonly ConversationEvent[]): readonly ConversationEvent[] {
  return items;
}

describe("conversation assembler", () => {
  it("merges reasoning deltas that belong to the same block", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "reasoning-start",
        sequence: 1,
        type: "assistant.block.started",
        stepId: "step-1",
        blockId: "reasoning-1",
        payload: { channel: "reasoning" },
      },
      {
        ...common,
        eventId: "reasoning-delta-1",
        sequence: 2,
        type: "assistant.block.delta",
        stepId: "step-1",
        blockId: "reasoning-1",
        payload: { channel: "reasoning", delta: "检查人物" },
      },
      {
        ...common,
        eventId: "reasoning-delta-2",
        sequence: 3,
        type: "assistant.block.delta",
        stepId: "step-1",
        blockId: "reasoning-1",
        payload: { channel: "reasoning", delta: "关系" },
      },
      {
        ...common,
        eventId: "reasoning-complete",
        sequence: 4,
        type: "assistant.block.completed",
        stepId: "step-1",
        blockId: "reasoning-1",
        payload: { channel: "reasoning" },
      },
    ));

    const node = projection.nodes[projection.order[0]];
    expect(node?.kind).toBe("reasoning");
    expect(node?.kind === "reasoning" ? node.text : null).toBe("检查人物关系");
    expect(node?.state).toBe("settled");
  });

  it("keeps answer, tool and later answer as independent ordered nodes", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "answer-1-start",
        sequence: 1,
        type: "assistant.block.started",
        stepId: "step-1",
        blockId: "answer-1",
        payload: { channel: "answer" },
      },
      {
        ...common,
        eventId: "answer-1-delta",
        sequence: 2,
        type: "assistant.block.delta",
        stepId: "step-1",
        blockId: "answer-1",
        payload: { channel: "answer", delta: "我先检查第三章。" },
      },
      {
        ...common,
        eventId: "tool-start",
        sequence: 3,
        type: "tool.call.started",
        payload: {
          toolCallId: "tool-1",
          toolName: "read_book_chapter",
          summary: "第三章",
        },
      },
      {
        ...common,
        eventId: "tool-complete",
        sequence: 4,
        type: "tool.call.completed",
        payload: { toolCallId: "tool-1" },
      },
      {
        ...common,
        eventId: "answer-2-start",
        sequence: 5,
        type: "assistant.block.started",
        stepId: "step-2",
        blockId: "answer-2",
        payload: { channel: "answer" },
      },
      {
        ...common,
        eventId: "answer-2-delta",
        sequence: 6,
        type: "assistant.block.delta",
        stepId: "step-2",
        blockId: "answer-2",
        payload: { channel: "answer", delta: "检查后发现动机断层。" },
      },
    ));

    expect(projection.order.map((key) => projection.nodes[key]?.kind)).toEqual([
      "assistant-text",
      "tool-call",
      "assistant-text",
    ]);
  });

  it("does not move a tool when its status changes", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "tool-1-start",
        sequence: 1,
        type: "tool.call.started",
        payload: { toolCallId: "tool-1", toolName: "read", summary: "第一章" },
      },
      {
        ...common,
        eventId: "tool-2-start",
        sequence: 2,
        type: "tool.call.started",
        payload: { toolCallId: "tool-2", toolName: "read", summary: "第二章" },
      },
      {
        ...common,
        eventId: "tool-1-complete",
        sequence: 3,
        type: "tool.call.completed",
        payload: { toolCallId: "tool-1" },
      },
    ));

    expect(projection.order).toEqual(["tool:run-1:tool-1", "tool:run-1:tool-2"]);
    expect(projection.nodes["tool:run-1:tool-1"]?.state).toBe("settled");
  });

  it("ignores an event that has already been applied", () => {
    const delta: ConversationEvent = {
      ...common,
      eventId: "same-delta",
      sequence: 1,
      type: "assistant.block.delta",
      stepId: "step-1",
      blockId: "answer-1",
      payload: { channel: "answer", delta: "只追加一次" },
    };
    const once = applyConversationEvent(createEmptyConversationProjection(), delta);
    const twice = applyConversationEvent(once, delta);
    const node = twice.nodes["assistant:run-1:answer-1"];

    expect(twice).toBe(once);
    expect(node?.kind === "assistant-text" ? node.content : null).toBe("只追加一次");
  });

  it("keeps approval controls out of the timeline while updating tool status", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "tool-start",
        sequence: 1,
        type: "tool.call.started",
        payload: { toolCallId: "tool-1", toolName: "edit", summary: "修改第三章" },
      },
      {
        ...common,
        eventId: "approval-request",
        sequence: 2,
        type: "approval.requested",
        payload: {
          approvalId: "approval-1",
          toolCallId: "tool-1",
          toolName: "edit",
          summary: "修改第三章",
          preview: "两处修改",
        },
      },
      {
        ...common,
        eventId: "approval-resolve",
        sequence: 3,
        type: "approval.resolved",
        payload: {
          approvalId: "approval-1",
          toolCallId: "tool-1",
          decision: "allow_once",
        },
      },
    ));
    const node = projection.nodes["tool:run-1:tool-1"];

    expect(projection.order).toEqual(["tool:run-1:tool-1"]);
    expect(node?.kind === "tool-call" ? node.status : null).toBe("running");
    expect(node && "approval" in node).toBe(false);
  });

  it("settles partial output and appends an error node when the turn fails", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "turn-start",
        sequence: 1,
        type: "turn.started",
        payload: {},
      },
      {
        ...common,
        eventId: "answer-delta",
        sequence: 2,
        type: "assistant.block.delta",
        stepId: "step-1",
        blockId: "answer-1",
        payload: { channel: "answer", delta: "已经完成一部分" },
      },
      {
        ...common,
        eventId: "turn-failed",
        sequence: 3,
        type: "turn.failed",
        payload: { error: "工具超时", code: "run.timed_out", retryable: true, durationMs: 3000 },
      },
    ));

    expect(projection.order.map((key) => projection.nodes[key]?.kind)).toEqual([
      "assistant-text",
      "turn-error",
    ]);
    expect(projection.nodes["assistant:run-1:answer-1"]?.state).toBe("settled");
    expect(projection.turns["run-1"]?.status).toBe("failed");
  });

  it("preserves arrival order across runs whose local sequences restart", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "run-1-user",
        sequence: 1,
        type: "user.message.created",
        payload: { messageId: "message-1", content: "第一轮" },
      },
      {
        ...common,
        eventId: "run-1-answer",
        sequence: 2,
        type: "assistant.block.completed",
        stepId: "step-1",
        blockId: "answer-1",
        payload: { channel: "answer", content: "第一轮回答" },
      },
      {
        ...common,
        runId: "run-2",
        eventId: "run-2-user",
        sequence: 1,
        type: "user.message.created",
        payload: { messageId: "message-2", content: "第二轮" },
      },
    ));

    expect(projection.order).toEqual([
      "user:message-1",
      "assistant:run-1:answer-1",
      "user:message-2",
    ]);
  });

  it("projects planned task lifecycle events into one stable task node", () => {
    const projection = assembleConversation(events(
      {
        ...common,
        eventId: "task-start",
        sequence: 1,
        type: "task.started",
        payload: {
          taskId: "analyze",
          title: "分析文本",
          agentId: "text-analyzer",
          attempt: 1,
        },
      },
      {
        ...common,
        eventId: "task-progress",
        sequence: 2,
        type: "task.progress",
        payload: { taskId: "analyze", summary: "验收结果：pass（100%）" },
      },
      {
        ...common,
        eventId: "task-complete",
        sequence: 3,
        type: "task.completed",
        payload: { taskId: "analyze", summary: "任务已完成" },
      },
    ));

    expect(projection.order).toEqual(["task:run-1:analyze"]);
    expect(projection.nodes["task:run-1:analyze"]).toMatchObject({
      kind: "task",
      status: "completed",
      state: "settled",
      summary: "任务已完成",
    });
  });
});
