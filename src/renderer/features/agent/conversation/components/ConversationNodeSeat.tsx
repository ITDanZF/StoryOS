import AssistantTextNodeView from "../nodes/AssistantTextNodeView.tsx";
import ReasoningNodeView from "../nodes/ReasoningNodeView.tsx";
import ToolCallNodeView from "../nodes/ToolCallNodeView.tsx";
import TurnErrorNodeView from "../nodes/TurnErrorNodeView.tsx";
import UserMessageNodeView from "../nodes/UserMessageNodeView.tsx";
import TaskNodeView from "../nodes/TaskNodeView.tsx";
import {
  conversationStore,
  type ConversationStore,
  useConversationNode,
} from "../store/conversationStore.ts";

type ConversationNodeSeatProps = {
  readonly nodeKey: string;
  readonly store?: ConversationStore;
  readonly finalAnswer?: boolean;
};

export default function ConversationNodeSeat({
  nodeKey,
  store = conversationStore,
  finalAnswer = false,
}: ConversationNodeSeatProps) {
  const node = useConversationNode(nodeKey, store);
  if (!node) return null;

  switch (node.kind) {
    case "user-message":
      return <UserMessageNodeView node={node} />;
    case "assistant-text":
      return <AssistantTextNodeView final={finalAnswer} node={node} />;
    case "reasoning":
      return <ReasoningNodeView node={node} />;
    case "tool-call":
      return <ToolCallNodeView node={node} />;
    case "task":
      return <TaskNodeView node={node} />;
    case "turn-error":
      return <TurnErrorNodeView node={node} />;
  }
}
