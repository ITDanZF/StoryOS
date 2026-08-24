import type { ReactNode } from "react";
import type { ConversationNode, TurnState } from "../model/conversationNode.ts";
import type { ConversationStore } from "../store/conversationStore.ts";
import ConversationNodeSeat from "./ConversationNodeSeat.tsx";
import ProcessStream from "./ProcessStream.tsx";
import TurnStatus from "./TurnStatus.tsx";

type TurnGroupProps = {
  readonly nodes: readonly ConversationNode[];
  readonly store: ConversationStore;
  readonly turn: TurnState | null;
};

function isProcessNode(node: ConversationNode): boolean {
  return node.kind === "reasoning" || node.kind === "tool-call" || node.kind === "task";
}

export default function TurnGroup({ nodes, store, turn }: TurnGroupProps) {
  const reversedNodes = [...nodes].reverse();
  const finalAnswerKey = reversedNodes
    .find((node) => node.kind === "assistant-text" && node.channel === "answer" && node.content.trim())?.key
    ?? reversedNodes
    .find((node) => node.kind === "assistant-text" && node.content.trim())?.key;
  const content: ReactNode[] = [];
  let processKeys: string[] = [];

  const flushProcess = () => {
    if (processKeys.length === 0) return;
    content.push(
      <ProcessStream key={`process:${processKeys[0]}`} nodeKeys={processKeys} store={store} />,
    );
    processKeys = [];
  };

  for (const node of nodes) {
    if (isProcessNode(node)) {
      processKeys.push(node.key);
      continue;
    }
    flushProcess();
    content.push(
      <ConversationNodeSeat
        finalAnswer={node.key === finalAnswerKey && turn?.status !== "running"}
        key={node.key}
        nodeKey={node.key}
        store={store}
      />,
    );
  }
  flushProcess();

  return (
    <section className="flex min-w-0 flex-col gap-2.5" data-conversation-turn={nodes[0]?.runId}>
      {content}
      {turn?.status === "running" && <TurnStatus runId={turn.runId} store={store} />}
    </section>
  );
}
