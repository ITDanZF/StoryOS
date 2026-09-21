import { ArrowDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { cn } from "../../../../../lib/utils.ts";
import ChatEmptyState from "../../components/ChatEmptyState.tsx";
import {
  conversationStore,
  type ConversationStore,
} from "../store/conversationStore.ts";
import ConversationFlow from "./ConversationFlow.tsx";
import "./conversationViewport.css";

type ConversationViewportProps = {
  readonly store?: ConversationStore;
  readonly loading?: boolean;
  readonly compact?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly suggestions?: readonly string[];
  readonly bottomPaddingClassName?: string;
  readonly hasOlder?: boolean;
  readonly loadingOlder?: boolean;
  readonly onLoadOlder?: () => Promise<void>;
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
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  onPickSuggestion,
}: ConversationViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  const order = useStore(store, (state) => state.order);
  const turns = useStore(store, (state) => state.turns);
  const running = Object.values(turns).some((turn) => turn.status === "running");
  const empty = order.length === 0 && !running;

  useEffect(() => {
    loadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !stuckRef.current) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [order.length]);

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

  const requestOlder = () => {
    const viewport = viewportRef.current;
    if (!viewport || !hasOlder || !onLoadOlder || loadingOlderRef.current) return;
    const previousHeight = viewport.scrollHeight;
    const previousTop = viewport.scrollTop;
    loadingOlderRef.current = true;
    void onLoadOlder().then(() => {
      viewport.scrollTop = previousTop + (viewport.scrollHeight - previousHeight);
    });
  };

  const updateScrollState = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const next = distance < 96;
    stuckRef.current = next;
    setStuckToBottom(next);
    if (viewport.scrollTop <= 48) requestOlder();
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
      <div
        className="conversation-viewport-scroll relative min-h-0 flex-1 overflow-y-auto"
        ref={viewportRef}
      >
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
      className="conversation-viewport-scroll relative min-h-0 flex-1 overflow-y-auto bg-surface-subtle"
      ref={viewportRef}
      onScroll={updateScrollState}
    >
      <div
        className={cn(
          "mx-auto min-h-full w-full",
          compact ? "max-w-none px-4 pt-4" : "max-w-3xl px-4 pt-9 sm:px-7 sm:pt-12",
          bottomPaddingClassName ?? (compact ? "pb-5" : "pb-40"),
        )}
        ref={contentRef}
      >
        {hasOlder && (
          <div className="mb-4 flex justify-center">
            {loadingOlder ? (
              <p className="text-[11px] text-text-subtle">正在加载更早的对话…</p>
            ) : (
              <button
                className="rounded-full border-0 bg-transparent px-2 py-1 text-[11px] text-text-subtle hover:text-text-secondary"
                type="button"
                onClick={requestOlder}
              >
                加载更早的对话
              </button>
            )}
          </div>
        )}
        <ConversationFlow store={store} />
      </div>
      {!stuckToBottom && (
        <div className="pointer-events-none sticky bottom-3 z-10 flex h-0 justify-end px-3">
          <button
            className="pointer-events-auto grid size-[34px] -translate-y-full place-items-center rounded-full border border-border bg-card/95 text-text-secondary shadow-[0_5px_16px_rgba(30,28,20,0.13)] backdrop-blur hover:bg-surface-subtle hover:text-foreground"
            type="button"
            aria-label="回到底部"
            title="回到底部"
            onClick={jumpToBottom}
          >
            <ArrowDown size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
