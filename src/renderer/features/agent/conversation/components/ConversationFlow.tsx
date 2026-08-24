import { useMemo } from "react";
import { useStore } from "zustand";
import type { ConversationNode, TurnState } from "../model/conversationNode.ts";
import {
  conversationStore,
  type ConversationStore,
} from "../store/conversationStore.ts";
import TurnGroup from "./TurnGroup.tsx";

type ConversationFlowProps = { readonly store?: ConversationStore };

type GroupedTurn = {
  readonly key: string;
  readonly nodes: readonly ConversationNode[];
  readonly turn: TurnState | null;
};

export function groupConversationTurns(
  order: readonly string[],
  nodes: Readonly<Record<string, ConversationNode>>,
  turns: Readonly<Record<string, TurnState>>,
): readonly GroupedTurn[] {
  const groups: { key: string; nodes: ConversationNode[]; turn: TurnState | null }[] = [];
  for (const nodeKey of order) {
    const node = nodes[nodeKey];
    if (!node) continue;
    const previous = groups.at(-1);
    if (previous?.nodes[0]?.runId === node.runId) {
      previous.nodes.push(node);
      continue;
    }
    groups.push({
      key: `${node.runId}:${groups.length}`,
      nodes: [node],
      turn: turns[node.runId] ?? null,
    });
  }
  return groups;
}

export default function ConversationFlow({
  store = conversationStore,
}: ConversationFlowProps) {
  const order = useStore(store, (state) => state.order);
  const nodes = useStore(store, (state) => state.nodes);
  const turns = useStore(store, (state) => state.turns);
  const groups = useMemo(
    () => groupConversationTurns(order, nodes, turns),
    [nodes, order, turns],
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {groups.map((group) => (
        <TurnGroup
          key={group.key}
          nodes={group.nodes}
          store={store}
          turn={group.turn}
        />
      ))}
    </div>
  );
}
