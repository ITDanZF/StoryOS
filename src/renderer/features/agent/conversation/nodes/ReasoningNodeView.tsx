import { BrainCircuit } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import DisclosureRow from "../components/DisclosureRow.tsx";
import type { ReasoningNode } from "../model/conversationNode.ts";

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/, 1)[0] ?? "";
}

function latestLine(text: string): string {
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.at(-1) ?? "";
}

export default function ReasoningNodeView({ node }: { readonly node: ReasoningNode }) {
  const summaryRef = useRef<HTMLSpanElement>(null);
  const running = node.state === "running";
  const summary = running ? latestLine(node.text) : firstLine(node.text);

  useLayoutEffect(() => {
    const element = summaryRef.current;
    if (!element) return;
    element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0;
  }, [running, summary]);

  return (
    <DisclosureRow
      icon={<BrainCircuit size={14} />}
      label="思考"
      running={running}
      summary={<span className="block overflow-hidden whitespace-nowrap" ref={summaryRef}>{summary || "正在分析…"}</span>}
    >
      <div className="whitespace-pre-wrap">{node.text}</div>
    </DisclosureRow>
  );
}

