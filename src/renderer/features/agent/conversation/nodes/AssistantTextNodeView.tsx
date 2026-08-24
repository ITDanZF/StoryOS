import MessageMarkdown from "../../components/MessageMarkdown.tsx";
import type { AssistantTextNode } from "../model/conversationNode.ts";

export default function AssistantTextNodeView({ node }: { readonly node: AssistantTextNode }) {
  return (
    <article className="min-w-0 px-1 text-neutral-800">
      <MessageMarkdown compact content={node.content} />
      {node.state === "running" && (
        <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-violet-500 align-[-3px] motion-reduce:animate-none" aria-label="正在生成" />
      )}
    </article>
  );
}

