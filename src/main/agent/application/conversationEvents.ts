import type { ToolApprovalDecision } from "../security/ToolPolicy.ts";
import type { SerializableTaskFailure } from "../Agent/orchestration/contracts.ts";

export type AssistantBlockChannel = "reasoning" | "answer" | "narration";

type ConversationEventBase<TType extends string, TPayload> = {
  readonly eventId: string;
  readonly sequence: number;
  readonly threadId: string;
  readonly runId: string;
  readonly type: TType;
  readonly timestamp: string;
  readonly payload: TPayload;
};

type AssistantBlockEventBase<TType extends string, TPayload> =
  ConversationEventBase<TType, TPayload> & {
    readonly stepId: string;
    readonly blockId: string;
  };

export type ConversationEvent =
  | ConversationEventBase<"user.message.created", {
      readonly messageId: string;
      readonly content: string;
    }>
  | ConversationEventBase<"turn.started", Record<string, never>>
  | ConversationEventBase<"turn.completed", {
      readonly content: string;
      readonly durationMs: number;
    }>
  | ConversationEventBase<"turn.failed", {
      readonly error: string;
      readonly code: string;
      readonly retryable: boolean;
      readonly durationMs: number;
    }>
  | AssistantBlockEventBase<"assistant.block.started", {
      readonly channel: AssistantBlockChannel;
    }>
  | AssistantBlockEventBase<"assistant.block.delta", {
      readonly channel: AssistantBlockChannel;
      readonly delta: string;
    }>
  | AssistantBlockEventBase<"assistant.block.completed", {
      readonly channel: AssistantBlockChannel;
      readonly content?: string;
    }>
  | ConversationEventBase<"tool.call.started", {
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly inputPreview?: string;
    }>
  | ConversationEventBase<"tool.call.progress", {
      readonly toolCallId: string;
      readonly summary: string;
    }>
  | ConversationEventBase<"tool.call.completed", {
      readonly toolCallId: string;
      readonly outputPreview?: string;
    }>
  | ConversationEventBase<"tool.call.failed", {
      readonly toolCallId: string;
      readonly error: string;
    }>
  | ConversationEventBase<"tool.call.rejected", {
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly reason: string;
    }>
  | ConversationEventBase<"approval.requested", {
      readonly approvalId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly preview: string;
    }>
  | ConversationEventBase<"approval.resolved", {
      readonly approvalId: string;
      readonly toolCallId: string;
      readonly decision: ToolApprovalDecision;
    }>
  | ConversationEventBase<"task.started", {
      readonly taskId: string;
      readonly title: string;
      readonly agentId: string;
      readonly attempt: number;
    }>
  | ConversationEventBase<"task.progress", {
      readonly taskId: string;
      readonly summary: string;
    }>
  | ConversationEventBase<"task.completed", {
      readonly taskId: string;
      readonly summary: string;
    }>
  | ConversationEventBase<"task.failed", {
      readonly taskId: string;
      readonly failure: SerializableTaskFailure;
    }>;

export type ConversationEventType = ConversationEvent["type"];
