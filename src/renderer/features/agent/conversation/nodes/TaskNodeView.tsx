import { AlertCircle, Check, ListChecks, LoaderCircle } from "lucide-react";
import DisclosureRow from "../components/DisclosureRow.tsx";
import type { TaskNode } from "../model/conversationNode.ts";

export default function TaskNodeView({ node }: { readonly node: TaskNode }) {
  const icon = node.status === "failed"
    ? <AlertCircle size={14} />
    : node.status === "completed"
      ? <Check size={14} />
      : node.status === "running"
        ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={14} />
        : <ListChecks size={14} />;
  return (
    <DisclosureRow
      failed={node.status === "failed"}
      icon={icon}
      label={node.title}
      running={node.status === "running"}
      summary={node.summary}
    >
      {node.error && <div className="rounded-lg bg-red-50 p-2 text-red-700">{node.error}</div>}
    </DisclosureRow>
  );
}

