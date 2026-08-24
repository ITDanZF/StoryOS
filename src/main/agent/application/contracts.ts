import type { NovelMutation } from "./novelEvents.ts";
import type { ChapterGenerationEvent } from "./chapterGenerationEvents.ts";
import type { ConversationEvent } from "./conversationEvents.ts";
import type { ConversationTurnContext } from "./conversationTurnContext.ts";

export type AgentUserMessage = {
  readonly messageId: string;
  readonly content: string;
};

export type AgentTurnInput = {
  readonly message: AgentUserMessage;
  readonly context?: ConversationTurnContext;
};

export type AgentRunRequest = AgentTurnInput & {
  readonly threadId: string;
};

export type SerializableError = {
  readonly name: string;
  readonly message: string;
  readonly code: string;
  readonly phase: "routing" | "planning" | "execution" | "review";
  readonly retryable: boolean;
};

export type RunStatus =
  | "running"
  | "cancelling"
  | "completed"
  | "aborted"
  | "timed_out"
  | "failed";

export type RunSnapshot = {
  readonly runId: string;
  readonly threadId: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly content?: string;
  readonly error?: SerializableError;
};

export type ApplicationEvent =
  | {
      readonly type: "run_started";
      readonly runId: string;
      readonly threadId: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "book_changed";
      readonly eventId: string;
      readonly projectId: string;
      readonly mutation: NovelMutation;
      readonly timestamp: string;
    }
  | {
      readonly type: "run_completed";
      readonly runId: string;
      readonly content: string;
      readonly durationMs: number;
      readonly timestamp: string;
    }
  | {
      readonly type: "run_aborted" | "run_timed_out" | "run_failed";
      readonly runId: string;
      readonly error: SerializableError;
      readonly durationMs: number;
      readonly timestamp: string;
    }
  | ChapterGenerationEvent
  | ConversationEvent;

export type ApplicationEventHandler = (
  event: ApplicationEvent,
) => void | Promise<void>;
