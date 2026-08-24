import type {
  ConversationNode,
  ConversationProjection,
  TurnState,
} from "./conversationNode.ts";

export function selectConversationOrder(
  projection: ConversationProjection,
): readonly string[] {
  return projection.order;
}

export function selectConversationNode(
  projection: ConversationProjection,
  key: string,
): ConversationNode | null {
  return projection.nodes[key] ?? null;
}

export function selectTurnState(
  projection: ConversationProjection,
  runId: string,
): TurnState | null {
  return projection.turns[runId] ?? null;
}

