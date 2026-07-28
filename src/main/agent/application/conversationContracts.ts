import type { ApplicationEvent } from "./contracts.ts";
import type { ThreadSnapshot } from "./threadContracts.ts";

export type ConversationScope =
  | {
      readonly kind: "global";
    }
  | {
      readonly kind: "project";
      readonly projectId: string;
    };

export type ConversationRef = {
  readonly scope: ConversationScope;
  readonly threadId: string;
};

export type CreateConversationRequest = {
  readonly scope: ConversationScope;
  readonly title: string;
};

export type SendConversationMessageRequest = ConversationRef & {
  readonly content: string;
};

export type ConversationSnapshot = {
  readonly scope: ConversationScope;
  readonly threads: ThreadSnapshot;
};

export type ConversationApplicationEvent = ApplicationEvent & {
  readonly conversationScope: ConversationScope;
};

export type ConversationApplicationEventHandler = (
  event: ConversationApplicationEvent,
) => void | Promise<void>;
