import { Send, Square } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import type { OutlineProposal } from "../../../shared/contracts/outline/outlineContracts.ts";
import { cn } from "../../../lib/utils.ts";
import type { ProseBrief, ProposalPreview } from "./model/document.ts";

type EventGraphComposerProps = {
  readonly scopeLabel: string;
  readonly placeholder: string;
  readonly draft: string;
  readonly busy: boolean;
  readonly proseEnabled: boolean;
  readonly proposal: OutlineProposal | null;
  readonly preview: ProposalPreview | null;
  readonly brief: ProseBrief | null;
  readonly notice: string | null;
  readonly onDraftChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onAccept: () => void;
  readonly onDiscard: () => void;
  readonly onWrite: () => void;
  readonly onDismissNotice: () => void;
};

export default function EventGraphComposer({
  scopeLabel,
  placeholder,
  draft,
  busy,
  proseEnabled,
  proposal,
  preview,
  brief,
  notice,
  onDraftChange,
  onSubmit,
  onAccept,
  onDiscard,
  onWrite,
  onDismissNotice,
}: EventGraphComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    onSubmit();
  };

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-3">
      {notice && (
        <p className="mb-2 flex items-start justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-text-secondary" role="status">
          <span>{notice}</span>
          <button className="shrink-0 border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onDismissNotice}>知道了</button>
        </p>
      )}
      {proposal?.status === "repairable" && preview && (
        <div className="mb-2 rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs leading-5">
          <p className="m-0 font-semibold">这版候选还不完整</p>
          <ul className="my-1 pl-4">{preview.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
          <button className="border-0 bg-transparent p-0 text-xs text-accent-foreground" type="button" onClick={onDiscard}>放弃</button>
        </div>
      )}
      {proposal?.status === "draft" && preview && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent-border bg-accent px-3 py-2 text-xs">
          <p className="m-0 min-w-0 leading-5">
            <b>{preview.summary}</b>
            <span className="text-text-secondary"> · 新节点 {preview.nodes.length} · 新边 {preview.relations.length}{preview.updatedNodeIds.length > 0 ? ` · 将修改 ${preview.updatedNodeIds.length} 个节点` : ""}</span>
          </p>
          <span className="flex gap-2">
            <button className="h-7 rounded-md border border-border bg-card px-2" type="button" disabled={busy} onClick={onDiscard}>放弃</button>
            <button className="h-7 rounded-md border border-accent bg-accent-foreground px-2 text-inverse" type="button" disabled={busy} onClick={onAccept}>接受</button>
          </span>
        </div>
      )}
      {proseEnabled && !brief && (
        <p className="mb-2 text-xs text-text-subtle">生成正文已打开。选中一个或几个节点后，再确认写入。</p>
      )}
      {proseEnabled && brief && (
        <div className="mb-2 rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5">
          <p className="m-0 font-semibold">{brief.chapterLabel ? `写入${brief.chapterLabel}` : "写入正文"}</p>
          {brief.blockers.length > 0 ? (
            <ul className="my-1 pl-4 text-text-secondary">{brief.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          ) : (
            <>
              <p className="my-1 text-text-secondary">{brief.orderNote} 将续写到这一章末尾。</p>
              <ul className="my-1 pl-4">
                {brief.nodes.map((node) => <li key={node.id}>{node.title}：{node.goal}</li>)}
              </ul>
              {brief.internalEdges.length > 0 && <p className="m-0 text-text-secondary">必须写进正文：{brief.internalEdges.map((edge) => `${edge.fromTitle}${edge.type}${edge.toTitle}`).join("、")}</p>}
              {brief.externalEdges.length > 0 && <p className="m-0 text-text-secondary">只作上下文：{brief.externalEdges.map((edge) => `${edge.fromTitle}${edge.type}${edge.toTitle}`).join("、")}</p>}
            </>
          )}
          <button className="mt-1 h-7 rounded-md border border-accent bg-accent-foreground px-2 text-inverse disabled:opacity-40" type="button" disabled={busy || brief.blockers.length > 0} onClick={onWrite}>确认写入</button>
        </div>
      )}
      <form className={cn("rounded-[18px] border border-border bg-background p-3 transition focus-within:border-accent-border focus-within:ring-2 focus-within:ring-accent-border/70")} onSubmit={submit}>
        <textarea
          ref={textareaRef}
          className="block max-h-[120px] min-h-12 w-full resize-none overflow-y-auto border-0 bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-text-subtle"
          rows={2}
          value={draft}
          placeholder={placeholder}
          aria-label="事件图想法"
          disabled={busy}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <footer className="flex items-center justify-between gap-3">
          <span className="truncate text-xs text-text-subtle">{scopeLabel} · 只生成事件图，不写正文</span>
          <button
            className="grid size-[30px] place-items-center rounded-full border-0 bg-accent-foreground text-inverse disabled:bg-muted disabled:text-text-subtle"
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label={busy ? "正在生成" : "发送"}
          >
            {busy ? <Square size={11} fill="currentColor" /> : <Send size={12} />}
          </button>
        </footer>
      </form>
    </div>
  );
}
