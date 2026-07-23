import { Bot, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { MessageView } from "../types.ts";

type ConversationViewProps = {
  readonly messages: readonly MessageView[];
  readonly loading: boolean;
};

function MessageContent({ content }: { readonly content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="text-[13px] leading-[1.75] text-neutral-800 sm:text-sm sm:leading-[1.82]">
      {blocks.map((block, index) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const code = block.slice(3, -3).replace(/^\w+\n/, "");
          return (
            <pre className="my-3 overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 font-mono text-xs leading-relaxed text-neutral-200" key={index}>
              <code>{code.trim()}</code>
            </pre>
          );
        }
        return <span className="whitespace-pre-wrap break-words" key={index}>{block}</span>;
      })}
    </div>
  );
}

function EmptyConversation({ loading }: { readonly loading: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-36 text-center sm:pb-44">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-neutral-900 to-stone-600 text-white shadow-lg">
        <Sparkles size={24} />
      </span>
      <h2 className="m-0 text-xl font-semibold tracking-tight sm:text-[22px]">
        {loading ? "正在载入工作台" : "开始一段新对话"}
      </h2>
      <p className="mt-2 max-w-lg text-xs leading-6 text-muted-foreground sm:text-[13px]">
        {loading ? "正在准备你的对话。" : "在下方输入问题，AI 的回复会实时显示在这里。"}
      </p>
    </div>
  );
}

export default function ConversationView({ messages, loading }: ConversationViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (loading || messages.length === 0) return <EmptyConversation loading={loading} />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-3 pb-40 pt-7 sm:gap-7 sm:px-6 sm:pb-44 sm:pt-11 2xl:max-w-4xl 2xl:pt-14">
        {messages.map((message) => (
          <article className={`flex gap-2 sm:gap-3 ${message.role === "user" ? "justify-end" : ""}`} key={message.id}>
            {message.role !== "user" && (
              <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-neutral-50 sm:size-[30px]">
                <Bot size={16} />
              </div>
            )}
            <div className={message.role === "user"
              ? "max-w-[88%] rounded-2xl rounded-br-[5px] bg-neutral-100 px-3.5 py-2.5 sm:max-w-[78%]"
              : "min-w-0 flex-1"}
            >
              {message.role !== "user" && <div className="mb-2 mt-1 text-[11px] font-semibold text-neutral-600">StoryOS AI</div>}
              <MessageContent content={message.content || (message.streaming ? "正在思考" : "")} />
              {message.streaming && <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-neutral-500 align-[-2px] motion-reduce:animate-none" aria-label="正在生成" />}
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
