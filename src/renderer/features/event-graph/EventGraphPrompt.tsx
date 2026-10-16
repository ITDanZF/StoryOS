import { Send } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { cn } from "../../../lib/utils.ts";

type EventGraphPromptProps = {
  readonly scopeLabel: string;
  readonly placeholder: string;
  readonly draft: string;
  readonly pendingTitle: string | null;
  readonly onDraftChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly hint: string;
  readonly onAccept: () => void;
  readonly onDiscard: () => void;
};

export default function EventGraphPrompt({
  scopeLabel,
  placeholder,
  draft,
  pendingTitle,
  onDraftChange,
  onSubmit,
  hint,
  onAccept,
  onDiscard,
}: EventGraphPromptProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  }, [draft]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || pendingTitle) return;
    onSubmit();
  };

  return (
    <form className="shrink-0 border-t border-border bg-card px-3 py-3" aria-label="事件图想法" onSubmit={submit}>
      {pendingTitle && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-accent-border bg-accent px-3 py-2 text-xs">
          <p className="m-0 min-w-0 leading-5">
            <b>草稿</b>
            <span className="text-text-secondary"> · {pendingTitle}</span>
          </p>
          <span className="flex gap-2">
            <button className="h-7 rounded-md border border-border bg-card px-2" type="button" onClick={onDiscard}>放弃</button>
            <button className="h-7 rounded-md border border-accent bg-accent-foreground px-2 text-inverse" type="button" onClick={onAccept}>留在图上</button>
          </span>
        </div>
      )}
      <div className={cn("rounded-[18px] border border-border bg-background p-3 transition focus-within:border-accent-border focus-within:ring-2 focus-within:ring-accent-border/70")}>
        <textarea
          ref={textareaRef}
          className="block max-h-24 min-h-12 w-full resize-none overflow-y-auto border-0 bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-text-subtle"
          rows={2}
          value={draft}
          placeholder={placeholder}
          aria-label="事件图想法"
          disabled={pendingTitle !== null}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <footer className="flex items-center justify-between gap-3">
          <span className="truncate text-xs text-text-subtle">{scopeLabel} · {hint}</span>
          <button
            className="grid size-[30px] place-items-center rounded-full border-0 bg-accent-foreground text-inverse disabled:bg-muted disabled:text-text-subtle"
            type="submit"
            disabled={pendingTitle !== null || !draft.trim()}
            aria-label="发送"
          >
            <Send size={12} />
          </button>
        </footer>
      </div>
    </form>
  );
}
