import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { cn } from "../../../../../lib/utils.ts";
import ChatEmptyState from "../../components/ChatEmptyState.tsx";
import {
  conversationStore,
  type ConversationStore,
} from "../store/conversationStore.ts";
import ConversationFlow from "./ConversationFlow.tsx";

type ConversationViewportProps = {
  readonly store?: ConversationStore;
  readonly loading?: boolean;
  readonly compact?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly suggestions?: readonly string[];
  readonly bottomPaddingClassName?: string;
  readonly onPickSuggestion?: (suggestion: string) => void;
};

export default function ConversationViewport({
  store = conversationStore,
  loading = false,
  compact = false,
  emptyTitle,
  emptyDescription,
  suggestions,
  bottomPaddingClassName,
  onPickSuggestion,
}: ConversationViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  const order = useStore(store, (state) => state.order);
  const turns = useStore(store, (state) => state.turns);
  const running = Object.values(turns).some((turn) => turn.status === "running");
  const empty = order.length === 0 && !running;

  useEffect(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stuckRef.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const updateScrollState = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const next = distance < 96;
    stuckRef.current = next;
    setStuckToBottom(next);
  };

  const jumpToBottom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    stuckRef.current = true;
    setStuckToBottom(true);
  };

  if (loading || empty) {
    return (
      <div className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]" ref={viewportRef}>
        <ChatEmptyState
          compact={compact}
          description={emptyDescription}
          loading={loading}
          suggestions={suggestions}
          title={emptyTitle}
          onPickSuggestion={onPickSuggestion}
        />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.045),transparent_30rem)] [scrollbar-gutter:stable]"
      ref={viewportRef}
      onScroll={updateScrollState}
    >
      <div
        className={cn(
          "mx-auto min-h-full w-full",
          compact ? "max-w-none px-4 pt-5" : "max-w-3xl px-4 pt-9 sm:px-7 sm:pt-12",
          bottomPaddingClassName ?? (compact ? "pb-5" : "pb-40"),
        )}
        ref={contentRef}
      >
        <ConversationFlow store={store} />
      </div>
      {!stuckToBottom && (
        <button
          className="sticky bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-neutral-200 bg-white/95 px-3 py-2 text-[11px] font-medium text-neutral-600 shadow-lg backdrop-blur hover:bg-neutral-50"
          type="button"
          onClick={jumpToBottom}
        >
          <ArrowDown size={13} />回到底部
        </button>
      )}
    </div>
  );
}
