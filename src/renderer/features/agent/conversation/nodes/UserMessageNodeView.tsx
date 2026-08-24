import type { UserMessageNode } from "../model/conversationNode.ts";

export default function UserMessageNodeView({ node }: { readonly node: UserMessageNode }) {
  return (
    <article className="ml-auto max-w-[88%] rounded-3xl rounded-br-md bg-neutral-900 px-4 py-3 text-xs leading-[1.75] text-white shadow-sm">
      <div className="whitespace-pre-wrap break-words">{node.content}</div>
    </article>
  );
}

