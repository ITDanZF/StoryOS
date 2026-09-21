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
    <article className={cn("group/answer min-w-0 px-1 text-foreground", final && "pt-1")}>
      <div className={cn(!final && "text-sm text-text-secondary [&>div]:text-sm [&>div]:leading-7")}>
        <MessageMarkdown compact content={node.content} />
      </div>
      {final && node.state !== "running" && node.content.trim() && (
        <div className="mt-2 flex min-h-7 items-center opacity-0 transition-opacity group-hover/answer:opacity-100 focus-within:opacity-100">
          <button
            className="inline-flex h-7 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-xs text-text-subtle hover:bg-muted hover:text-text-secondary"
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
