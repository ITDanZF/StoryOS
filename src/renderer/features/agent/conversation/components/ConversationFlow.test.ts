import { describe, expect, it } from "vitest";
import type {
  ConversationNode,
  TurnState,
} from "../model/conversationNode.ts";
import { groupConversationTurns } from "./ConversationFlow.tsx";

function node(
  key: string,
  runId: string,
  kind: "user-message" | "assistant-text",
): ConversationNode {
  const base = {
    key,
    runId,
    anchorSequence: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    state: "settled" as const,
  };
  return kind === "user-message"
    ? { ...base, kind, messageId: key, content: key }
    : { ...base, kind, stepId: key, blockId: key, channel: "answer", content: key };
}

describe("conversation turn grouping", () => {
  it("groups contiguous nodes by run while preserving their order", () => {
    const nodes = {
      user1: node("user1", "run-1", "user-message"),
      answer1: node("answer1", "run-1", "assistant-text"),
      user2: node("user2", "run-2", "user-message"),
      answer2: node("answer2", "run-2", "assistant-text"),
    };
    const turns: Record<string, TurnState> = {
      "run-1": { runId: "run-1", status: "completed", startedAt: new Date(0).toISOString() },
      "run-2": { runId: "run-2", status: "running", startedAt: new Date(0).toISOString() },
    };

    const groups = groupConversationTurns(
      ["user1", "answer1", "user2", "answer2"],
      nodes,
      turns,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.nodes.map((item) => item.key)).toEqual(["user1", "answer1"]);
    expect(groups[0]?.turn?.status).toBe("completed");
    expect(groups[1]?.nodes.map((item) => item.key)).toEqual(["user2", "answer2"]);
    expect(groups[1]?.turn?.status).toBe("running");
  });

  it("ignores stale order keys", () => {
    const answer = node("answer", "run-1", "assistant-text");
    expect(groupConversationTurns(["missing", "answer"], { answer }, {}))
      .toHaveLength(1);
  });
});
