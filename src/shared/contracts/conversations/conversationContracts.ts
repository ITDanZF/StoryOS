import type { ApplicationEvent } from "./applicationContracts.ts";
import type { ConversationTurnContext } from "./conversationTurnContext.ts";
import type { ThreadSnapshot } from "./threadContracts.ts";

export type ConversationApplicationEvent = ApplicationEvent & {
  readonly conversationScope: ConversationScope;
};

export type ConversationScope =
  | {
      readonly kind: "global";
    }
  | {
      readonly kind: "project";
      readonly projectId: string;
    };

export const CONVERSATION_HISTORY_PAGE_SIZE = 80;
export const CONVERSATION_HISTORY_LATEST_SEQUENCE = Number.MAX_SAFE_INTEGER;

export type ConversationRef = {
  readonly scope: ConversationScope;
  readonly threadId: string;
  readonly afterSequence?: number;
  readonly beforeSequence?: number;
  readonly limit?: number;
};

export type ConversationSnapshot = {
  readonly scope: ConversationScope;
  readonly threads: ThreadSnapshot;
};

export type CreateConversationRequest = {
  readonly scope: ConversationScope;
  readonly title: string;
};

export type SendConversationMessageRequest = ConversationRef & {
  readonly content: string;
  readonly context?: ConversationTurnContext;
};
