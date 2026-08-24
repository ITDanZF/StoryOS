import { useStore } from "zustand";
import { conversationStore, type ConversationStore } from "../store/conversationStore.ts";

export default function TurnStatus({
  runId,
  store = conversationStore,
}: {
  readonly runId?: string;
  readonly store?: ConversationStore;
}) {
  const turns = useStore(store, (state) => state.turns);
  const running = runId
    ? turns[runId]?.status === "running"
    : Object.values(turns).some((turn) => turn.status === "running");
  if (!running) return null;

  return (
    <div className="h-7 px-1 text-xs font-medium">
      <span className="animate-pulse bg-gradient-to-r from-blue-600 via-violet-500 to-blue-600 bg-[length:200%_100%] bg-clip-text text-transparent motion-reduce:animate-none">
        正在深入创作…
      </span>
    </div>
  );
}
