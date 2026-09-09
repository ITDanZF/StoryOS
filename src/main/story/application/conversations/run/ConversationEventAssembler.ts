import type { ApplicationEvent } from "../../../../../shared/contracts/conversations/applicationContracts.ts";
import type { ConversationEvent } from "../../../../../shared/contracts/conversations/conversationEvents.ts";
export type ConversationEventInput = ConversationEvent extends infer TEvent
  ? TEvent extends ConversationEvent
    ? Omit<TEvent, "eventId" | "sequence" | "threadId" | "runId" | "timestamp">
    : never
  : never;
export default class ConversationEventAssembler {
  constructor(private readonly emit: (event: ApplicationEvent) => Promise<void>) {}
  private readonly conversationSequences = new Map<string, number>();

  private readonly activeAnswerBlocks = new Map<
    string,
    {
      readonly stepId: string;
      readonly blockId: string;
    }
  >();

  private readonly answerBlockCounts = new Map<string, number>();

  private readonly activeReasoningBlocks = new Map<
    string,
    {
      readonly stepId: string;
      readonly blockId: string;
    }
  >();

  private readonly reasoningBlockCounts = new Map<string, number>();

  async handleTextChunk(runId: string, threadId: string, chunk: string): Promise<void> {
    await this.completeReasoningBlock(runId, threadId);
    let block = this.activeAnswerBlocks.get(runId);
    if (!block) {
      const blockNumber = (this.answerBlockCounts.get(runId) ?? 0) + 1;
      this.answerBlockCounts.set(runId, blockNumber);
      block = {
        stepId: `step-${blockNumber}`,
        blockId: `answer-${blockNumber}`,
      };
      this.activeAnswerBlocks.set(runId, block);
      await this.emitConversation(runId, threadId, {
        type: "assistant.block.started",
        stepId: block.stepId,
        blockId: block.blockId,
        payload: { channel: "answer" },
      });
    }

    await this.emitConversation(runId, threadId, {
      type: "assistant.block.delta",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "answer", delta: chunk },
    });
  }

  async completeAnswerBlock(runId: string, threadId: string): Promise<void> {
    const block = this.activeAnswerBlocks.get(runId);
    if (!block) return;
    this.activeAnswerBlocks.delete(runId);
    await this.emitConversation(runId, threadId, {
      type: "assistant.block.completed",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "answer" },
    });
  }

  async handleReasoningChunk(runId: string, threadId: string, chunk: string): Promise<void> {
    let block = this.activeReasoningBlocks.get(runId);
    if (!block) {
      const blockNumber = (this.reasoningBlockCounts.get(runId) ?? 0) + 1;
      this.reasoningBlockCounts.set(runId, blockNumber);
      block = {
        stepId: `reasoning-step-${blockNumber}`,
        blockId: `reasoning-${blockNumber}`,
      };
      this.activeReasoningBlocks.set(runId, block);
      await this.emitConversation(runId, threadId, {
        type: "assistant.block.started",
        stepId: block.stepId,
        blockId: block.blockId,
        payload: { channel: "reasoning" },
      });
    }
    await this.emitConversation(runId, threadId, {
      type: "assistant.block.delta",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "reasoning", delta: chunk },
    });
  }

  async completeReasoningBlock(runId: string, threadId: string): Promise<void> {
    const block = this.activeReasoningBlocks.get(runId);
    if (!block) return;
    this.activeReasoningBlocks.delete(runId);
    await this.emitConversation(runId, threadId, {
      type: "assistant.block.completed",
      stepId: block.stepId,
      blockId: block.blockId,
      payload: { channel: "reasoning" },
    });
  }

  async emitConversation(
    runId: string,
    threadId: string,
    input: ConversationEventInput,
  ): Promise<void> {
    await this.emit(this.createEvent(runId, threadId, input));
  }
  createEvent(runId: string, threadId: string, input: ConversationEventInput): ConversationEvent {
    const sequence = (this.conversationSequences.get(runId) ?? 0) + 1;
    this.conversationSequences.set(runId, sequence);
    const event = Object.freeze({
      ...input,
      eventId: `conversation_event_${crypto.randomUUID()}`,
      sequence,
      runId,
      threadId,
      timestamp: new Date().toISOString(),
    }) as ConversationEvent;
    return event;
  }
  clearRun(runId: string): void {
    this.conversationSequences.delete(runId);
    this.activeAnswerBlocks.delete(runId);
    this.answerBlockCounts.delete(runId);
    this.activeReasoningBlocks.delete(runId);
    this.reasoningBlockCounts.delete(runId);
  }
  clear(): void {
    this.conversationSequences.clear();
    this.activeAnswerBlocks.clear();
    this.answerBlockCounts.clear();
    this.activeReasoningBlocks.clear();
    this.reasoningBlockCounts.clear();
  }
}
