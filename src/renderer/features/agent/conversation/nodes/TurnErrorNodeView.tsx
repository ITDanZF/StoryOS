import { CircleAlert } from "lucide-react";
import DisclosureRow from "../components/DisclosureRow.tsx";
import type { TurnErrorNode } from "../model/conversationNode.ts";

export default function TurnErrorNodeView({ node }: { readonly node: TurnErrorNode }) {
  return (
    <DisclosureRow failed icon={<CircleAlert size={14} />} label="执行失败" summary={node.error}>
      <div className="text-red-700">{node.error}</div>
    </DisclosureRow>
  );
}

