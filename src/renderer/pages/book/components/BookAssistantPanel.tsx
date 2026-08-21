import {
  BookOpen,
  Expand,
  Folder,
  Layers3,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type FormEvent } from "react";
import { cn } from "../../../../lib/utils.ts";
import type { ThreadSnapshot } from "../../../../shared/agent/contracts.ts";
import AgentActivityTimeline from "../../../features/agent/components/AgentActivityTimeline.tsx";
import ChatViewport from "../../../features/agent/components/ChatViewport.tsx";
import type {
  MessageView,
  PendingToolApprovalView,
  ResolveToolApproval,
  ToolActivityView,
} from "../../../features/agent/types.ts";
import ProjectConversationSwitcher from "./ProjectConversationSwitcher.tsx";

const MAX_TEXTAREA_HEIGHT = 156;

function getRunIdFromMessageId(messageId: string): string | null {
  if (messageId.startsWith("answer-")) return messageId.slice("answer-".length);
  if (messageId.startsWith("draft-")) return messageId.slice("draft-".length);
  return null;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

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

  const messageRunIds = new Set(messages.map((message) => getRunIdFromMessageId(message.id)).filter((runId): runId is string => Boolean(runId)));
  const orphanApprovals = pendingApprovals.filter((approval) => !messageRunIds.has(approval.runId));
  const orphanActivities = toolActivities.filter((activity) => !messageRunIds.has(activity.runId));

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
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-[10px] font-medium text-neutral-500">
          <Layers3 size={12} />上下文
        </span>
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 text-[10px] text-neutral-500" title={`当前项目：${projectName}`}>
          <Folder size={12} />
          <span className="max-w-28 truncate">{projectName}</span>
        </span>
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 text-[10px] text-neutral-500" title={bookTitle ? `当前书籍：${bookTitle}` : "当前书籍待命名"}>
          <BookOpen size={12} />
          <span className="max-w-28 truncate">{bookTitle ?? "待命名书籍"}</span>
        </span>
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

      <ChatViewport
        assistantName="StoryOS"
        bottomPaddingClassName="pb-4"
        compact
        emptyDescription={chapterNumber === null
          ? "这是属于当前书籍的项目对话，适合做设定梳理、结构规划和整体节奏讨论。"
          : "当前章节会作为本次项目对话的上下文，适合续写、润色、检查冲突和提取伏笔。"}
        emptyTitle={chapterNumber === null ? "和 AI 一起规划这本书" : "和 AI 一起打磨这一章"}
        footer={(orphanApprovals.length > 0 || orphanActivities.length > 0) && (
          <AgentActivityTimeline
            approvals={orphanApprovals}
            activities={orphanActivities}
            compact
            defaultOpen={orphanApprovals.length > 0 || orphanActivities.some((activity) => activity.status === "started")}
            title="当前执行过程"
            onResolveApproval={onResolveApproval}
          />
        )}
        messages={messages}
        renderMessageFooter={(message) => {
          const runId = getRunIdFromMessageId(message.id);
          if (!runId) return null;
          const messageApprovals = pendingApprovals.filter((approval) => approval.runId === runId);
          const messageActivities = toolActivities.filter((activity) => activity.runId === runId);
          if (messageApprovals.length === 0 && messageActivities.length === 0) return null;
          return (
            <AgentActivityTimeline
              approvals={messageApprovals}
              activities={messageActivities}
              compact
              defaultOpen={message.streaming || messageApprovals.length > 0 || messageActivities.some((activity) => activity.status === "started")}
              title={message.streaming ? "正在执行" : "本次执行过程"}
              onResolveApproval={onResolveApproval}
            />
          );
        }}
        suggestions={chapterNumber === null
          ? ["梳理整本书的主线冲突", "检查人物动机是否成立", "规划下一卷的节奏"]
          : ["检查本章节奏和冲突", "续写下一段并保持风格", "提取本章伏笔和回收点"]}
        onPickSuggestion={onDraftChange}
        onQuote={(content) => onDraftChange(`${draft ? `${draft}\n\n` : ""}> ${content.slice(0, 320).replace(/\n/g, "\n> ")}\n\n`)}
      />

      <form className="mx-3 mb-3 shrink-0 rounded-[18px] border border-neutral-200 bg-white/95 p-3 shadow-[0_14px_34px_rgba(30,28,20,0.09)] backdrop-blur-xl transition focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100" onSubmit={(event) => void submit(event)}>
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[9px] text-neutral-400">
          <span className="flex min-w-0 items-center gap-1"><Folder className="shrink-0" size={11} />项目 / <b className="truncate">{projectName}</b></span>
          <span>·</span>
          <span className="flex min-w-0 items-center gap-1">
            <BookOpen className="shrink-0" size={11} />
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
          ref={textareaRef}
          className="mt-2 block max-h-[156px] min-h-[64px] w-full resize-none overflow-y-auto border-0 bg-transparent text-xs leading-5 text-neutral-800 outline-none placeholder:text-neutral-400"
          rows={2}
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
