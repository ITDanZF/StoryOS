import { ArrowUp, CornerDownLeft, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../lib/utils.ts";

type MessageComposerProps = {
  readonly disabled: boolean;
  readonly activeRunId?: string;
  readonly onSend: (content: string) => Promise<void>;
  readonly onCancel: (runId: string) => Promise<void>;
};

export default function MessageComposer({ disabled, activeRunId, onSend, onCancel }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

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
    <div className="absolute inset-x-2 bottom-2 z-10 mx-auto min-h-28 w-auto max-w-3xl rounded-[18px] border border-input bg-white/95 p-3 shadow-[0_8px_30px_rgb(0_0_0/0.08)] backdrop-blur transition focus-within:border-neutral-400 sm:inset-x-5 sm:bottom-4 sm:min-h-32 sm:rounded-[20px] sm:px-4 sm:py-3 2xl:max-w-4xl">
      <textarea
        className="block min-h-14 w-full resize-none border-0 bg-transparent px-0.5 py-0 text-xs leading-6 text-neutral-800 outline-none placeholder:text-neutral-400 sm:min-h-16 sm:text-[13px]"
        aria-label="发送消息"
        disabled={disabled}
        placeholder={disabled ? "请先完成 AI 模型配置" : "输入消息，和 AI 开始对话…"}
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-muted-foreground">
          <CornerDownLeft className="shrink-0" size={14} />Enter 发送 · Shift + Enter 换行
        </span>
        <button
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border-0 transition",
            activeRunId ? "bg-neutral-200 text-neutral-700" : "bg-neutral-900 text-white hover:-translate-y-0.5 hover:bg-black",
            !activeRunId && (disabled || !value.trim() || sending) && "cursor-default bg-neutral-200 text-neutral-400 hover:translate-y-0 hover:bg-neutral-200",
          )}
          type="button"
          aria-label={activeRunId ? "停止生成" : "发送"}
          disabled={disabled || (!activeRunId && (!value.trim() || sending))}
          onClick={() => activeRunId ? void onCancel(activeRunId) : void submit()}
        >
          {activeRunId ? <Square size={14} fill="currentColor" /> : <ArrowUp size={19} />}
        </button>
      </div>
    </div>
  );
}
