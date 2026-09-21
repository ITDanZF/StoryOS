import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "../model/conversationEvent.ts";
import { alignConversationHistoryPage, loadLatestConversationHistory } from "./conversationHistory.ts";

const common = {
  threadId: "thread-1",
  runId: "run-1",
  timestamp: new Date(0).toISOString(),
};

function event(
  threadSequence: number,
  type: ConversationEvent["type"],
): ConversationEvent {
  if (type === "user.message.created") {
    return {
      ...common,
      eventId: `user-${threadSequence}`,
      threadSequence,
      sequence: threadSequence,
      type,
      payload: { messageId: `message-${threadSequence}`, content: "提问" },
    };
  }
  if (type === "turn.started") {
    return {
      ...common,
      eventId: `turn-${threadSequence}`,
      threadSequence,
      sequence: threadSequence,
      type,
      payload: {},
    };
  }
  return {
    ...common,
    eventId: `delta-${threadSequence}`,
    threadSequence,
    sequence: threadSequence,
    type: "assistant.block.delta",
    stepId: "step-1",
    blockId: "answer-1",
    payload: { channel: "answer", delta: "字" },
  };
}

describe("alignConversationHistoryPage", () => {
  it("keeps a page that already starts on a user turn", () => {
    const page = alignConversationHistoryPage(
      [event(8, "user.message.created"), event(9, "assistant.block.delta")],
      false,
    );
    expect(page.events.map((item) => item.eventId)).toEqual(["user-8", "delta-9"]);
    expect(page.hasOlder).toBe(true);
    expect(page.oldestSequence).toBe(8);
  });

  it("drops a partial turn at the start of a latest page", () => {
    const page = alignConversationHistoryPage(
      [
        event(4, "assistant.block.delta"),
        event(5, "user.message.created"),
        event(6, "assistant.block.delta"),
      ],
      false,
    );
    expect(page.events.map((item) => item.eventId)).toEqual(["user-5", "delta-6"]);
    expect(page.hasOlder).toBe(true);
    expect(page.oldestSequence).toBe(5);
  });

  it("marks the thread start when the first stored event is kept", () => {
    const page = alignConversationHistoryPage(
      [event(1, "turn.started"), event(2, "assistant.block.delta")],
      true,
    );
    expect(page.hasOlder).toBe(false);
    expect(page.oldestSequence).toBe(1);
  });
});

describe("loadLatestConversationHistory", () => {
  it("requests the newest events and snaps to a turn start", async () => {
    const events = Array.from({ length: 120 }, (_, index) =>
      event(
        index + 1,
        index === 50 || index === 100 ? "user.message.created" : "assistant.block.delta",
      ),
    );
    const page = await loadLatestConversationHistory(
      async ({ beforeSequence, limit }) =>
        events
          .filter((item) => item.threadSequence !== undefined && item.threadSequence < beforeSequence)
          .slice(-limit),
      { kind: "global" },
      "thread-1",
    );
    expect(page.events[0]?.eventId).toBe("user-51");
    expect(page.events.at(-1)?.eventId).toBe("delta-120");
    expect(page.hasOlder).toBe(true);
    expect(page.oldestSequence).toBe(51);
  });
});
