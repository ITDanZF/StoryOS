import type { ConversationApplicationEvent } from "../../../../shared/contracts/conversations/conversationContracts.ts";
export type {
  ConversationApplicationEvent,
  ConversationRef,
  ConversationScope,
  ConversationSnapshot,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from "../../../../shared/contracts/conversations/conversationContracts.ts";

export type ConversationApplicationEventHandler = (
  event: ConversationApplicationEvent,
) => void | Promise<void>;
