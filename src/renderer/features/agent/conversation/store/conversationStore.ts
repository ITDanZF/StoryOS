import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { ConversationEvent } from "../model/conversationEvent.ts";
import {
  applyConversationEvent,
  assembleConversation,
} from "../model/conversationAssembler.ts";
import {
  createEmptyConversationProjection,
  type ConversationNode,
  type ConversationProjection,
  type TurnState,
} from "../model/conversationNode.ts";

export type ConversationStoreState = ConversationProjection & {
  readonly applyEvent: (event: ConversationEvent) => void;
  readonly applyEvents: (events: readonly ConversationEvent[]) => void;
  readonly hydrate: (events: readonly ConversationEvent[]) => void;
  readonly reset: () => void;
};

export function createConversationStore() {
  return createStore<ConversationStoreState>()((set) => ({
    ...createEmptyConversationProjection(),
    applyEvent: (event) => set((current) => applyConversationEvent(current, event)),
    applyEvents: (events) => set((current) =>
      events.reduce(applyConversationEvent, current)),
    hydrate: (events) => set(assembleConversation(events)),
    reset: () => set(createEmptyConversationProjection()),
  }));
}

export type ConversationStore = ReturnType<typeof createConversationStore>;

export const conversationStore = createConversationStore();

export function useConversationOrder(
  store: ConversationStore = conversationStore,
): readonly string[] {
  return useStore(store, (state) => state.order);
}

export function useConversationNode(
  key: string,
  store: ConversationStore = conversationStore,
): ConversationNode | null {
  return useStore(store, (state) => state.nodes[key] ?? null);
}

export function useConversationTurn(
  runId: string,
  store: ConversationStore = conversationStore,
): TurnState | null {
  return useStore(store, (state) => state.turns[runId] ?? null);
}

