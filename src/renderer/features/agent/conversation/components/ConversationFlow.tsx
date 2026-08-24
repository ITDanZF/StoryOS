import {
  conversationStore,
  type ConversationStore,
  useConversationOrder,
} from "../store/conversationStore.ts";
import ConversationNodeSeat from "./ConversationNodeSeat.tsx";
import TurnStatus from "./TurnStatus.tsx";

type ConversationFlowProps = { readonly store?: ConversationStore };

export default function ConversationFlow({
  store = conversationStore,
}: ConversationFlowProps) {
  const order = useConversationOrder(store);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {order.map((nodeKey) => (
        <ConversationNodeSeat
          key={nodeKey}
          nodeKey={nodeKey}
          store={store}
        />
      ))}
      <TurnStatus store={store} />
    </div>
  );
}
