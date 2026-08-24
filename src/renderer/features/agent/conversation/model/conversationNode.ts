import type { AssistantBlockChannel } from "./conversationEvent.ts";

export type ConversationNodeState = "running" | "settled" | "failed";

type ConversationNodeBase<TKind extends string> = {
  readonly key: string;
  readonly kind: TKind;
  readonly runId: string;
  readonly anchorSequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: ConversationNodeState;
};

export type UserMessageNode = ConversationNodeBase<"user-message"> & {
  readonly messageId: string;
  readonly content: string;
};

export type AssistantTextNode = ConversationNodeBase<"assistant-text"> & {
  readonly stepId: string;
  readonly blockId: string;
  readonly channel: Exclude<AssistantBlockChannel, "reasoning">;
  readonly content: string;
};

export type ReasoningNode = ConversationNodeBase<"reasoning"> & {
  readonly stepId: string;
  readonly blockId: string;
  readonly text: string;
};

export type ToolCallStatus =
  | "running"
  | "awaiting_approval"
  | "completed"
  | "rejected"
  | "failed";

export type ToolCallNode = ConversationNodeBase<"tool-call"> & {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly summary: string;
  readonly status: ToolCallStatus;
  readonly inputPreview?: string;
  readonly outputPreview?: string;
  readonly error?: string;
};

export type TurnErrorNode = ConversationNodeBase<"turn-error"> & {
  readonly error: string;
};

export type TaskNode = ConversationNodeBase<"task"> & {
  readonly taskId: string;
  readonly title: string;
  readonly agentId: string;
  readonly attempt: number;
  readonly summary: string;
  readonly status: "running" | "completed" | "failed";
  readonly error?: string;
};

export type ConversationNode =
  | UserMessageNode
  | AssistantTextNode
  | ReasoningNode
  | ToolCallNode
  | TaskNode
  | TurnErrorNode;

export type TurnState = {
  readonly runId: string;
  readonly status: "running" | "completed" | "failed";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly content?: string;
  readonly error?: string;
};

export type ConversationProjection = {
  readonly order: readonly string[];
  readonly nodes: Readonly<Record<string, ConversationNode>>;
  readonly turns: Readonly<Record<string, TurnState>>;
  readonly processedEventIds: Readonly<Record<string, true>>;
};

export function createEmptyConversationProjection(): ConversationProjection {
  return {
    order: [],
    nodes: {},
    turns: {},
    processedEventIds: {},
  };
}
