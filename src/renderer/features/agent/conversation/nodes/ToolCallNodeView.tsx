import { AlertCircle, Check, LoaderCircle, ShieldAlert, Wrench } from "lucide-react";
import DisclosureRow from "../components/DisclosureRow.tsx";
import type { ToolCallNode } from "../model/conversationNode.ts";
import { getToolPresentation } from "../tools/toolPresenterRegistry.ts";

function ToolIcon({ node }: { readonly node: ToolCallNode }) {
  if (node.status === "failed" || node.status === "rejected") return <AlertCircle size={14} />;
  if (node.status === "completed") return <Check size={14} />;
  if (node.status === "awaiting_approval") return <ShieldAlert size={14} />;
  if (node.status === "running") return <LoaderCircle className="animate-spin motion-reduce:animate-none" size={14} />;
  return <Wrench size={14} />;
}

export default function ToolCallNodeView({ node }: { readonly node: ToolCallNode }) {
  const presentation = getToolPresentation(node);
  const running = node.status === "running";
  const failed = node.status === "failed" || node.status === "rejected";
  const hasDetails = Boolean(node.inputPreview || node.outputPreview || node.error);
  const summary = node.status === "awaiting_approval"
    ? `${presentation.summary} · 等待确认`
    : presentation.summary;

  return (
    <DisclosureRow
      failed={failed}
      icon={<ToolIcon node={node} />}
      label={presentation.label}
      running={running}
      summary={summary}
    >
      {hasDetails && (
        <div className="space-y-3">
          {node.inputPreview && <pre className="m-0 whitespace-pre-wrap font-mono text-[10px]">{node.inputPreview}</pre>}
          {node.outputPreview && <div className="whitespace-pre-wrap">{node.outputPreview}</div>}
          {node.error && <div className="rounded-lg bg-red-50 p-2 text-red-700">{node.error}</div>}
        </div>
      )}
    </DisclosureRow>
  );
}
