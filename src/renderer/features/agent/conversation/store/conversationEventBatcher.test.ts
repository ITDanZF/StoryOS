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

describe("conversation event batcher", () => {
  it("publishes multiple visual deltas in one frame", () => {
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

    const publish = scheduled as (() => void) | null;
    expect(publish).not.toBeNull();
    publish?.();
    expect(applyEvents).toHaveBeenCalledOnce();
    expect(applyEvents.mock.calls[0][0]).toHaveLength(2);
    expect(applyEvent).not.toHaveBeenCalled();
  });

  it("flushes pending deltas before a structural event", () => {
    const calls: string[] = [];
    const batcher = new ConversationEventBatcher(
      {
        applyEvent: () => calls.push("structural"),
        applyEvents: () => calls.push("deltas"),
      },
      { requestFrame: () => 1, cancelFrame: vi.fn() },
    );

    batcher.enqueue(delta("delta-1", 1));
    batcher.enqueue({
      ...common,
      eventId: "turn-complete",
      sequence: 2,
      type: "turn.completed",
      payload: { content: "done", durationMs: 1 },
    });

    expect(calls).toEqual(["deltas", "structural"]);
  });
});
