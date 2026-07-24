import {
  ArrowUp,
  CornerDownLeft,
  Folder,
  MessageSquareText,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/utils.ts";

type MessageComposerProps = {
  readonly disabled: boolean;
  readonly activeRunId?: string;
  readonly projectName?: string;
  readonly onSend: (content: string) => Promise<void>;
  readonly onCancel: (runId: string) => Promise<void>;
};

const MAX_TEXTAREA_HEIGHT = 144;

export default function MessageComposer({
  disabled,
  activeRunId,
  projectName,
  onSend,
  onCancel,
}: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inProject = Boolean(projectName);
  const contextName = projectName ?? "无项目";
  const canSend = !disabled && !sending && !activeRunId && Boolean(value.trim());

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      MAX_TEXTAREA_HEIGHT,
    )}px`;
  }, [value]);

  const submit = async () => {
    const content = value.trim();
    if (!content || disabled || sending || activeRunId) return;
    setSending(true);
    setValue("");
    try {
      await onSend(content);
    } catch {
      setValue(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="absolute inset-x-2 bottom-2 z-10 mx-auto w-auto max-w-3xl rounded-[20px] border border-neutral-200 bg-white/95 px-3 pb-2.5 pt-2.5 shadow-[0_10px_32px_rgba(15,23,42,0.09)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 focus-within:border-neutral-400 focus-within:shadow-[0_14px_38px_rgba(15,23,42,0.11),0_0_0_3px_rgba(15,23,42,0.035)] sm:inset-x-5 sm:bottom-4 sm:px-3.5 sm:pb-3 sm:pt-3 2xl:max-w-4xl">
      <div className="mb-1.5 flex min-w-0 items-center">
        <span
          className={cn(
            "inline-flex h-6 min-w-0 max-w-[70%] items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium",
            inProject
              ? "bg-amber-50 text-amber-800"
              : "bg-violet-50 text-violet-700",
          )}
          title={inProject ? `当前对话属于项目：${contextName}` : "当前为无项目对话"}
        >
          {inProject
            ? <Folder className="shrink-0 opacity-70" size={12} />
            : (
                <MessageSquareText
                  className="shrink-0 opacity-70"
                  size={12}
                />
              )}
          <span className="shrink-0 opacity-65">
            {inProject ? "项目" : "对话"}
          </span>
          <span className="opacity-30">/</span>
          <strong className="truncate font-semibold">{contextName}</strong>
        </span>
      </div>

      <textarea
        ref={textareaRef}
        className="block min-h-10 max-h-36 w-full resize-none overflow-y-auto border-0 bg-transparent px-0.5 py-1.5 text-[13px] leading-6 text-neutral-800 outline-none placeholder:text-neutral-400 sm:min-h-11 sm:text-sm"
        aria-label="发送消息"
        disabled={disabled}
        placeholder={
          disabled
            ? "请先完成 AI 模型配置"
            : activeRunId
              ? "AI 正在回复…"
              : "输入消息，和 AI 继续对话…"
        }
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />

      <div className="mt-0.5 flex min-h-8 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-neutral-400">
          <CornerDownLeft className="shrink-0 opacity-70" size={12} />
          <span>
            <kbd className="font-sans text-neutral-500">Enter</kbd> 发送
            <span className="hidden sm:inline">
              {" · "}
              <kbd className="font-sans text-neutral-500">Shift + Enter</kbd>
              {" "}换行
            </span>
          </span>
        </span>
        <button
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full border-0 transition-[color,background-color,transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2",
            activeRunId &&
              "bg-neutral-900 text-white shadow-sm hover:scale-105 hover:bg-black",
            !activeRunId && canSend &&
              "bg-neutral-900 text-white shadow-sm hover:-translate-y-0.5 hover:bg-black hover:shadow-md",
            !activeRunId && !canSend &&
              "cursor-default bg-neutral-100 text-neutral-400",
          )}
          type="button"
          aria-label={activeRunId ? "停止生成" : "发送"}
          disabled={disabled || (!activeRunId && !canSend)}
          onClick={() =>
            activeRunId ? void onCancel(activeRunId) : void submit()}
        >
          {activeRunId
            ? <Square size={12} fill="currentColor" />
            : <ArrowUp size={17} />}
        </button>
      </div>
    </div>
  );
}
