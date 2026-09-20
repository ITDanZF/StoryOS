import { describe, expect, it, vi } from "vitest";
import type { ConversationEvent } from "../model/conversationEvent.ts";
import { ConversationEventBatcher } from "./conversationEventBatcher.ts";

const common = {
  threadId: "thread-1",
  runId: "run-1",
  timestamp: new Date(0).toISOString(),
};

function delta(eventId: string, sequence: number): ConversationEvent {
  return {
    ...common,
    eventId,
    sequence,
    type: "assistant.block.delta",
    stepId: "step-1",
    blockId: "answer-1",
    payload: { channel: "answer", delta: eventId },
  };
}

function completed(
  eventId: string,
  sequence: number,
  content?: string,
): ConversationEvent {
  return {
    ...common,
    eventId,
    sequence,
    type: "assistant.block.completed",
    stepId: "step-1",
    blockId: "answer-1",
    payload: { channel: "answer", ...(content === undefined ? {} : { content }) },
  };
}

describe("conversation event batcher", () => {
  it("drops assistant deltas and publishes only the completed block", () => {
    let scheduled: (() => void) | null = null;
    const applyEvent = vi.fn();
    const applyEvents = vi.fn();
    const batcher = new ConversationEventBatcher(
      { applyEvent, applyEvents },
      {
        requestFrame: (callback) => {
          scheduled = callback;
          return 1;
        },
        cancelFrame: vi.fn(),
      },
    );

    batcher.enqueue(delta("delta-1", 1));
    batcher.enqueue(delta("delta-2", 2));
    expect(applyEvents).not.toHaveBeenCalled();
    expect(scheduled).toBeNull();

    const completion = completed("completed", 3, "delta-1delta-2");
    batcher.enqueue(completion);

    expect(applyEvent).toHaveBeenCalledOnce();
    expect(applyEvent).toHaveBeenCalledWith(completion);
    expect(applyEvents).not.toHaveBeenCalled();
  });

  it("does not retain legacy deltas when completion content is absent", () => {
    const applyEvent = vi.fn();
    const applyEvents = vi.fn();
    const batcher = new ConversationEventBatcher(
      { applyEvent, applyEvents },
      { requestFrame: () => 1, cancelFrame: vi.fn() },
    );

    batcher.enqueue(delta("delta-1", 1));
    const completion = completed("completed", 2);
    batcher.enqueue(completion);

    expect(applyEvent).toHaveBeenCalledOnce();
    expect(applyEvent).toHaveBeenCalledWith(completion);
    expect(applyEvents).not.toHaveBeenCalled();
  });

  it("continues batching tool progress per animation frame", () => {
    let scheduled: (() => void) | null = null;
    const applyEvents = vi.fn();
    const batcher = new ConversationEventBatcher(
      { applyEvent: vi.fn(), applyEvents },
      {
        requestFrame: (callback) => {
          scheduled = callback;
          return 1;
        },
        cancelFrame: vi.fn(),
      },
    );

    batcher.enqueue({
      ...common,
      eventId: "tool-progress",
      sequence: 1,
      type: "tool.call.progress",
      payload: { toolCallId: "tool-1", summary: "working" },
    });

    const publish = scheduled as (() => void) | null;
    expect(publish).not.toBeNull();
    publish?.();
    expect(applyEvents).toHaveBeenCalledOnce();
  });

  it("does not publish dropped deltas when a turn fails", () => {
    const applyEvent = vi.fn();
    const applyEvents = vi.fn();
    const batcher = new ConversationEventBatcher(
      { applyEvent, applyEvents },
      { requestFrame: () => 1, cancelFrame: vi.fn() },
    );

    batcher.enqueue(delta("delta-1", 1));
    const failed: ConversationEvent = {
      ...common,
      eventId: "failed",
      sequence: 2,
      type: "turn.failed",
      payload: {
        durationMs: 1,
        error: "failed",
        code: "failed",
        retryable: true,
      },
    };
    batcher.enqueue(failed);

    expect(applyEvent).toHaveBeenCalledWith(failed);
    expect(applyEvent).toHaveBeenCalledOnce();
    expect(applyEvents).not.toHaveBeenCalled();
  });
});
