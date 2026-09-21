import type { UserMessageNode } from "../model/conversationNode.ts";

export default function UserMessageNodeView({ node }: { readonly node: UserMessageNode }) {
  return (
    <article className="ml-auto max-w-[84%] rounded-[20px] rounded-br-md bg-muted px-4 py-2.5 text-sm leading-6 text-foreground">
      <div className="whitespace-pre-wrap break-words">{node.content}</div>
    </article>
  );
}
