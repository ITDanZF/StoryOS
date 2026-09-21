import {
  CONVERSATION_HISTORY_LATEST_SEQUENCE,
  CONVERSATION_HISTORY_PAGE_SIZE,
} from "../../../../../shared/contracts/conversations/conversationContracts.ts";
import type { ConversationScope } from "../../../../../shared/contracts/conversations/conversationContracts.ts";
import type { ConversationEvent } from "../model/conversationEvent.ts";

export type ConversationHistoryPage = {
  readonly events: readonly ConversationEvent[];
  readonly hasOlder: boolean;
  readonly oldestSequence: number | null;
};

function isTurnBoundary(event: ConversationEvent): boolean {
  return event.type === "user.message.created" || event.type === "turn.started";
}

export function conversationThreadSequence(event: ConversationEvent): number {
  if (event.threadSequence === undefined) {
    throw new Error("Conversation event is missing threadSequence.");
  }
  return event.threadSequence;
}

export function alignConversationHistoryPage(
  events: readonly ConversationEvent[],
  reachedStart: boolean,
): ConversationHistoryPage {
  const index = events.findIndex(isTurnBoundary);
  const aligned = index > 0 ? events.slice(index) : events;
  return {
    events: aligned,
    hasOlder: !reachedStart || index > 0,
    oldestSequence: aligned.length === 0 ? null : conversationThreadSequence(aligned[0]),
  };
}

type ListConversationEvents = (request: {
  readonly scope: ConversationScope;
  readonly threadId: string;
  readonly beforeSequence: number;
  readonly limit: number;
}) => Promise<readonly ConversationEvent[]>;

async function collectOlderEvents(
  listEvents: ListConversationEvents,
  scope: ConversationScope,
  threadId: string,
  beforeSequence: number,
): Promise<{ events: ConversationEvent[]; reachedStart: boolean }> {
  const collected: ConversationEvent[] = [];
  let cursor = beforeSequence;
  for (;;) {
    const page = await listEvents({
      scope,
      threadId,
      beforeSequence: cursor,
      limit: CONVERSATION_HISTORY_PAGE_SIZE,
    });
    if (page.length === 0) {
      return { events: collected, reachedStart: true };
    }
    const oldest = conversationThreadSequence(page[0]);
    if (oldest >= cursor) {
      throw new Error("Conversation page cursor did not advance.");
    }
    collected.unshift(...page);
    const reachedStart = page.length < CONVERSATION_HISTORY_PAGE_SIZE;
    if (reachedStart || collected.findIndex(isTurnBoundary) >= 0) {
      return { events: collected, reachedStart };
    }
    cursor = oldest;
  }
}

export async function loadLatestConversationHistory(
  listEvents: ListConversationEvents,
  scope: ConversationScope,
  threadId: string,
): Promise<ConversationHistoryPage> {
  const { events, reachedStart } = await collectOlderEvents(
    listEvents,
    scope,
    threadId,
    CONVERSATION_HISTORY_LATEST_SEQUENCE,
  );
  return alignConversationHistoryPage(events, reachedStart);
}

export async function loadOlderConversationHistory(
  listEvents: ListConversationEvents,
  scope: ConversationScope,
  threadId: string,
  beforeSequence: number,
): Promise<ConversationHistoryPage> {
  const { events, reachedStart } = await collectOlderEvents(
    listEvents,
    scope,
    threadId,
    beforeSequence,
  );
  return alignConversationHistoryPage(events, reachedStart);
}
