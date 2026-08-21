import {
  Bot,
  Check,
  Clipboard,
  MessageSquareQuote,
  RotateCcw,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../../../lib/utils.ts";
import type { MessageView } from "../types.ts";
import MessageMarkdown from "./MessageMarkdown.tsx";

type ChatMessageProps = {
  readonly message: MessageView;
  readonly compact?: boolean;
  readonly assistantName?: string;
  readonly onQuote?: (content: string) => void;
  readonly onRetry?: (message: MessageView) => void;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatMessage({
  message,
  compact = false,
  assistantName = "StoryOS AI",
  onQuote,
  onRetry,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isMeta = message.role === "system" || message.role === "tool";
  const content = message.content || (message.streaming ? "正在思考…" : "");

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      // Clipboard access can be unavailable; the UI simply stays unchanged.
    }
  };

  if (isMeta) {
    return (
      <article className="mx-auto max-w-[92%] rounded-2xl border border-neutral-200 bg-neutral-50/80 px-3 py-2 text-[11px] leading-5 text-neutral-500">
        <div className="mb-1 font-medium text-neutral-600">{message.role === "tool" ? "工具消息" : "系统消息"}</div>
        <MessageMarkdown compact content={content} />
      </article>
    );
  }

  return (
    <article className={cn("group flex min-w-0 gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className={cn("grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-neutral-950 to-violet-700 text-white shadow-sm", compact ? "size-7" : "size-9")}>
          {isAssistant ? <Sparkles size={compact ? 14 : 17} /> : <Bot size={compact ? 14 : 17} />}
        </div>
      )}

      <div className={cn("min-w-0", isUser ? "flex max-w-[88%] flex-col items-end sm:max-w-[76%]" : "max-w-full flex-1")}>
        <div className={cn("mb-1.5 flex items-center gap-2 text-[10px] text-neutral-400", isUser && "justify-end")}>
          <span className="font-medium text-neutral-500">{isUser ? "你" : assistantName}</span>
          <span>{formatTime(message.createdAt)}</span>
          {message.streaming && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-600">生成中</span>}
        </div>

        <div
          className={cn(
            "relative min-w-0 shadow-sm transition-shadow duration-200 group-hover:shadow-md",
            isUser
              ? "rounded-3xl rounded-br-md bg-neutral-950 px-4 py-3 text-white"
              : "rounded-3xl rounded-tl-md border border-neutral-200 bg-white px-4 py-3.5 text-neutral-800",
            compact && (isUser ? "rounded-2xl rounded-br px-3 py-2.5" : "rounded-2xl rounded-tl px-3 py-3"),
          )}
        >
          {isUser ? (
            <div className={cn("whitespace-pre-wrap break-words", compact ? "text-xs leading-[1.75]" : "text-[13px] leading-[1.75] sm:text-sm")}>
              {content}
            </div>
          ) : (
            <MessageMarkdown compact={compact} content={content} />
          )}
          {message.streaming && (
            <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-500 align-[-3px] motion-reduce:animate-none" aria-label="正在生成" />
          )}
        </div>

        <div className={cn("mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", isUser && "justify-end")}>
          <button className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" type="button" onClick={() => void copy()}>
            {copied ? <Check size={12} /> : <Clipboard size={12} />}
            {copied ? "已复制" : "复制"}
          </button>
          {onQuote && (
            <button className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" type="button" onClick={() => onQuote(content)}>
              <MessageSquareQuote size={12} />引用
            </button>
          )}
          {!isUser && onRetry && (
            <button className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" type="button" onClick={() => onRetry(message)}>
              <RotateCcw size={12} />重试
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className={cn("grid shrink-0 place-items-center rounded-2xl border border-neutral-200 bg-white text-neutral-500 shadow-sm", compact ? "size-7" : "size-9")}>
          <UserRound size={compact ? 14 : 17} />
        </div>
      )}
    </article>
  );
}
