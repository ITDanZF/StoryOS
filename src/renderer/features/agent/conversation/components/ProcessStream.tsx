import ConversationNodeSeat from "./ConversationNodeSeat.tsx";
import type { ConversationStore } from "../store/conversationStore.ts";

type ProcessStreamProps = {
  readonly nodeKeys: readonly string[];
  readonly store: ConversationStore;
};

export default function ProcessStream({ nodeKeys, store }: ProcessStreamProps) {
  return (
    <div className="space-y-0.5 py-0.5" aria-label="AI 工作过程">
      {nodeKeys.map((nodeKey) => (
        <ConversationNodeSeat key={nodeKey} nodeKey={nodeKey} store={store} />
      ))}
    </div>
  );
}
