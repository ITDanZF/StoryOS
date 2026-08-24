import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../../../lib/utils.ts";
import MessageMarkdown from "../../components/MessageMarkdown.tsx";
import type { AssistantTextNode } from "../model/conversationNode.ts";

export default function AssistantTextNodeView({
  node,
  final = false,
}: {
  readonly node: AssistantTextNode;
  readonly final?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard failures are non-critical.
    }
  };

  return (
    <article className={cn("group/answer min-w-0 px-1 text-neutral-800", final && "pt-1")}>
      <div className={cn(!final && "text-[13px] text-neutral-700 [&>div]:text-[13px] [&>div]:leading-[22px]")}>
        <MessageMarkdown compact content={node.content} />
      </div>
      {node.state === "running" && (
        <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-violet-500 align-[-3px] motion-reduce:animate-none" aria-label="正在生成" />
      )}
      {final && node.state !== "running" && node.content.trim() && (
        <div className="mt-2 flex min-h-7 items-center opacity-0 transition-opacity group-hover/answer:opacity-100 focus-within:opacity-100">
          <button
            className="inline-flex h-7 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-[11px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            type="button"
            onClick={() => void copy()}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      )}
    </article>
  );
}
