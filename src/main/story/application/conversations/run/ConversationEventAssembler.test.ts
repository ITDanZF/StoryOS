import { describe, expect, it } from "vitest";
import type { ApplicationEvent } from "../../../../../shared/contracts/conversations/applicationContracts.ts";
import ConversationEventAssembler from "./ConversationEventAssembler.ts";

describe("ConversationEventAssembler", () => {
  it("includes the full answer in the completion event", async () => {
    const emitted: ApplicationEvent[] = [];
    const assembler = new ConversationEventAssembler(async (event) => {
      emitted.push(event);
    });

    await assembler.handleTextChunk("run-1", "thread-1", "第一段");
    await assembler.handleTextChunk("run-1", "thread-1", "第二段");
    await assembler.completeAnswerBlock("run-1", "thread-1");

    expect(emitted).toHaveLength(1);
    expect(emitted.at(-1)).toMatchObject({
      type: "assistant.block.completed",
      payload: { channel: "answer", content: "第一段第二段" },
    });
  });

  it("includes the full reasoning in the completion event", async () => {
    const emitted: ApplicationEvent[] = [];
    const assembler = new ConversationEventAssembler(async (event) => {
      emitted.push(event);
    });

    await assembler.handleReasoningChunk("run-1", "thread-1", "分析");
    await assembler.handleReasoningChunk("run-1", "thread-1", "过程");
    await assembler.completeReasoningBlock("run-1", "thread-1");

    expect(emitted).toHaveLength(1);
    expect(emitted.at(-1)).toMatchObject({
      type: "assistant.block.completed",
      payload: { channel: "reasoning", content: "分析过程" },
    });
  });
});
