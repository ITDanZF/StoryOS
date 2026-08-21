import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../../../lib/utils.ts";
import type { MessageView } from "../types.ts";
import ChatEmptyState from "./ChatEmptyState.tsx";
import ChatMessage from "./ChatMessage.tsx";

type ChatViewportProps = {
  readonly messages: readonly MessageView[];
  readonly loading?: boolean;
  readonly compact?: boolean;
  readonly assistantName?: string;
  readonly bottomPaddingClassName?: string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly suggestions?: readonly string[];
  readonly footer?: ReactNode;
  readonly onPickSuggestion?: (suggestion: string) => void;
  readonly onQuote?: (content: string) => void;
  readonly renderMessageFooter?: (message: MessageView) => ReactNode;
};

function messageDateKey(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toDateString();
}

function formatMessageDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "历史消息";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString("zh-CN", {
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ChatViewport({
  messages,
  loading = false,
  compact = false,
  assistantName,
  bottomPaddingClassName,
  emptyTitle,
  emptyDescription,
  suggestions,
  footer,
  onPickSuggestion,
  onQuote,
  renderMessageFooter,
}: ChatViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);

  useEffect(() => {
    if (!stuckToBottom) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [footer, messages, stuckToBottom]);

  const updateScrollState = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setStuckToBottom(distance < 96);
  };

  const jumpToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setStuckToBottom(true);
  };

  if (loading || (messages.length === 0 && !footer)) {
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
    <div className="relative min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.055),transparent_32rem)] [scrollbar-gutter:stable]" ref={viewportRef} onScroll={updateScrollState}>
      <div
        className={cn(
          "mx-auto flex min-h-full w-full flex-col",
          compact ? "max-w-none gap-4 px-3 pt-4" : "max-w-3xl gap-6 px-3 pt-7 sm:gap-7 sm:px-6 sm:pt-11 2xl:max-w-4xl 2xl:pt-14",
          bottomPaddingClassName ?? (compact ? "pb-4" : "pb-40 sm:pb-44"),
        )}
      >
        {messages.map((message, index) => {
          const messageFooter = renderMessageFooter?.(message);
          return (
            <div key={message.id}>
              {(index === 0 || messageDateKey(messages[index - 1].createdAt) !== messageDateKey(message.createdAt)) && (
                <div className={cn("mb-4 flex items-center gap-3 text-neutral-300 before:h-px before:flex-1 before:bg-neutral-200/80 after:h-px after:flex-1 after:bg-neutral-200/80", compact ? "text-[9px]" : "text-[10px]")}>
                  {formatMessageDate(message.createdAt)}
                </div>
              )}
              <ChatMessage assistantName={assistantName} compact={compact} message={message} onQuote={onQuote} />
              {messageFooter && (
                <div className={cn("mt-2", message.role === "user" ? "ml-auto max-w-[88%] sm:max-w-[76%]" : compact ? "ml-10" : "ml-12")}>
                  {messageFooter}
                </div>
              )}
            </div>
          );
        })}
        {footer}
        <div ref={endRef} />
      </div>

      {!stuckToBottom && (
        <button
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-neutral-200 bg-white/95 px-3 py-2 text-[11px] font-medium text-neutral-600 shadow-lg backdrop-blur hover:bg-neutral-50"
          type="button"
          onClick={jumpToBottom}
        >
          <ArrowDown size={13} />回到底部
        </button>
      )}
    </div>
  );
}
