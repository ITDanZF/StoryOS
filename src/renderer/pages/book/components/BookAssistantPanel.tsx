import {
  BookOpen,
  Expand,
  Folder,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type FormEvent } from "react";
import { cn } from "../../../../lib/utils.ts";
import type { ThreadSnapshot } from "../../../../shared/agent/contracts.ts";
import type {
  MessageView,
  PendingToolApprovalView,
  ResolveToolApproval,
  ToolActivityView,
} from "../../../features/agent/types.ts";
import BookToolActivity from "./BookToolActivity.tsx";
import ProjectConversationSwitcher from "./ProjectConversationSwitcher.tsx";

type BookAssistantPanelProps = {
  readonly projectName: string;
  readonly bookTitle: string | null;
  readonly chapterNumber: number | null;
  readonly chapterTitle: string | null;
  readonly conversationSnapshot: ThreadSnapshot | null;
  readonly runningThreadIds: ReadonlySet<string>;
  readonly messages: readonly MessageView[];
  readonly pendingApprovals: readonly PendingToolApprovalView[];
  readonly toolActivities: readonly ToolActivityView[];
  readonly connected: boolean;
  readonly running: boolean;
  readonly focused: boolean;
  readonly width: number;
  readonly draft: string;
  readonly contextEnabled: boolean;
  readonly onDraftChange: (value: string) => void;
  readonly onContextEnabledChange: (enabled: boolean) => void;
  readonly onSend: (content: string) => Promise<void>;
  readonly onCancel: () => Promise<void>;
  readonly onResolveApproval: ResolveToolApproval;
  readonly onCreateConversation: () => Promise<void>;
  readonly onSwitchConversation: (threadId: string) => Promise<void>;
  readonly onDeleteConversation: (threadId: string) => Promise<void>;
  readonly onToggleFocus: () => void;
};

export default function BookAssistantPanel({
  projectName,
  bookTitle,
  chapterNumber,
  chapterTitle,
  conversationSnapshot,
  runningThreadIds,
  messages,
  pendingApprovals,
  toolActivities,
  connected,
  running,
  focused,
  width,
  draft,
  contextEnabled,
  onDraftChange,
  onContextEnabledChange,
  onSend,
  onCancel,
  onResolveApproval,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onToggleFocus,
}: BookAssistantPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingApprovals, toolActivities]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = draft.trim();
    if (!normalized || running || !connected) return;
    onDraftChange("");
    try {
      await onSend(normalized);
    } catch {
      onDraftChange(normalized);
    }
  };

  return (
    <aside
      className={cn(
      "flex h-full shrink-0 flex-col border-l border-neutral-200 bg-[#fbfbfa]",
      focused
        ? "min-w-0 flex-1"
        : "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:shadow-2xl",
      )}
      style={focused
        ? undefined
        : { width: `min(${width}px, 94vw)` } as CSSProperties}
      aria-label="AI 对话"
    >
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-neutral-200 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-neutral-900 to-violet-700 text-white shadow-md">
            <Sparkles size={17} />
          </span>
          <ProjectConversationSwitcher
            snapshot={conversationSnapshot}
            connected={connected}
            runningThreadIds={runningThreadIds}
            onCreate={onCreateConversation}
            onSelect={onSwitchConversation}
            onDelete={onDeleteConversation}
          />
        </div>
        <div className="flex">
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" type="button" aria-label="新建项目对话" onClick={() => void onCreateConversation()}>
            <Plus size={16} />
          </button>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" type="button" aria-label="展开对话" onClick={onToggleFocus}>
            <Expand size={15} />
          </button>
        </div>
      </header>

      <div className="flex min-h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-100 px-4 py-2">
        <span className="text-[10px] text-neutral-400">上下文</span>
        {contextEnabled && chapterNumber !== null && chapterTitle && (
          <button className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-2.5 text-[10px] text-violet-700" type="button" title="移除章节上下文" onClick={() => onContextEnabledChange(false)}>
            <BookOpen size={12} />
            <span>第{chapterNumber}章 · {chapterTitle}</span>
            <X size={10} />
          </button>
        )}
        {!contextEnabled && chapterNumber !== null && (
          <button className="grid size-6 shrink-0 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-400 hover:text-neutral-800" type="button" aria-label="添加章节上下文" onClick={() => onContextEnabledChange(true)}>
            <Plus size={11} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 2xl:px-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="grid min-h-[260px] place-items-center text-center">
            <div>
              <span className="mx-auto mb-3 grid size-9 place-items-center rounded-xl bg-neutral-100 text-neutral-500">
                <Sparkles size={17} />
              </span>
              <p className="m-0 text-xs font-medium text-neutral-700">
                和 AI 一起打磨这一章
              </p>
              <p className="mt-1.5 text-[10px] leading-5 text-neutral-400">
                {chapterNumber === null
                  ? "这是属于当前书籍的项目对话"
                  : "当前章节会作为本次项目对话的上下文"}
              </p>
            </div>
          </div>
        )}
        <div className="grid gap-5">
          {messages.map((message, index) => (
            <div key={message.id}>
              {(index === 0 || messageDateKey(messages[index - 1].createdAt) !== messageDateKey(message.createdAt)) && (
                <div className="mb-5 flex items-center gap-2 text-[9px] text-neutral-300 before:h-px before:flex-1 before:bg-neutral-100 after:h-px after:flex-1 after:bg-neutral-100">
                  {formatMessageDate(message.createdAt)}
                </div>
              )}
              <article>
              {message.role === "user" ? (
                <div className="ml-auto max-w-[88%] rounded-xl rounded-br-sm bg-neutral-100 px-3 py-2.5 text-xs leading-[1.75] text-neutral-700">
                  {message.content}
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid size-[23px] place-items-center rounded-lg bg-neutral-800 text-white">
                      <Sparkles size={12} />
                    </span>
                    <strong className="text-[10px]">StoryOS</strong>
                  </div>
                  <p className="m-0 whitespace-pre-wrap text-xs leading-[1.8] text-neutral-700">
                    {message.content || (message.streaming ? "正在思考…" : "")}
                  </p>
                </div>
              )}
              </article>
            </div>
          ))}
          <BookToolActivity
            approvals={pendingApprovals}
            activities={toolActivities}
            onResolveApproval={onResolveApproval}
          />
          <div ref={endRef} />
        </div>
      </div>

      <form className="mx-3 mb-3 shrink-0 rounded-[14px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(30,28,20,0.07)] focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100" onSubmit={(event) => void submit(event)}>
        <div className="flex items-center gap-1.5 text-[9px] text-neutral-400">
          <span className="flex items-center gap-1"><Folder size={11} />项目 / <b>{projectName}</b></span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <BookOpen size={11} />
                  {bookTitle ? <>书籍 / <b>{bookTitle}</b></> : "书籍 / 待命名"}
          </span>
          <span>·</span>
          <strong>
            {bookTitle
              ? chapterNumber === null ? "整本书" : `第${chapterNumber}章`
              : "项目对话"}
          </strong>
        </div>
        <textarea
          className="mt-2 min-h-[68px] w-full resize-none border-0 bg-transparent text-xs leading-5 outline-none placeholder:text-neutral-400"
          rows={3}
          value={draft}
          placeholder={chapterNumber === null
            ? "输入消息，和 AI 一起构思这本书……"
            : "输入消息，和 AI 一起打磨这一章……"}
          aria-label="发送消息"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <footer className="flex items-center justify-between">
          <span className="text-[9px] text-neutral-400">Enter 发送 · Shift + Enter 换行</span>
          <button
            className="grid size-[30px] place-items-center rounded-full border-0 bg-neutral-900 text-white transition hover:bg-violet-700 disabled:bg-neutral-100 disabled:text-neutral-300"
            type={running ? "button" : "submit"}
            disabled={!connected || (!running && !draft.trim())}
            aria-label={running ? "停止生成" : "发送"}
            onClick={running ? () => void onCancel() : undefined}
          >
            {running ? <Square size={11} fill="currentColor" /> : <Send size={12} />}
          </button>
        </footer>
      </form>
    </aside>
  );
}

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
