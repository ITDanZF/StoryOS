import { Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button.tsx";
import type { ProposeInput } from "./useEventGraphSession.ts";
import type { OutlinePlanningScope } from "../../../shared/contracts/outline/outlineContracts.ts";

type EventGraphAgentProps = {
  readonly selectedNode: { readonly id: string; readonly title: string } | null;
  readonly revisionFocusIds?: readonly string[];
  readonly scope?: OutlinePlanningScope;
  readonly busy: boolean;
  readonly onPropose: (input: ProposeInput) => Promise<boolean>;
  readonly onSaveIdea: (text: string) => Promise<boolean>;
};

export default function EventGraphAgent({ selectedNode, revisionFocusIds = [], scope, busy, onPropose, onSaveIdea }: EventGraphAgentProps) {
  const [instruction, setInstruction] = useState("");
  const selected = selectedNode !== null;
  const revising = selected && revisionFocusIds.length > 0;
  const scopeLabel = scope?.kind === "relation" ? "规划两事件关系" : scope?.kind === "stage" ? `完善阶段「${selectedNode?.title ?? ""}」` : selected ? `${revising ? "调整" : "展开"}「${selectedNode.title}」` : "从全书设定继续";
  const ideaIsValid = instruction.trim() !== "" && Array.from(instruction.trim()).length <= 200;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onPropose({
      planningMode: "sequential",
      parentNodeId: selected && !revising ? selectedNode.id : null,
      focusNodeIds: selected ? (revising ? revisionFocusIds : [selectedNode.id]) : [],
      scope: scope ?? (selectedNode ? { kind: "node", nodeId: selectedNode.id } : { kind: "book" }),
      instruction: instruction.trim(),
    });
  };

  return <form className="shrink-0 border-t border-border bg-card px-4 py-3" aria-label="生成故事主线" onSubmit={submit}>
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={15} className="text-accent-foreground" />让 AI 帮你推进主线</span>
      <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-text-secondary">
        {scopeLabel}
      </span>
      <span className="text-xs text-text-secondary">写一句方向，或留空让 AI 提议</span>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1">
        <span className="sr-only">你希望故事如何发展</span>
        <textarea
          className="block min-h-[58px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-text-secondary focus:border-accent-border focus-visible:ring-2 focus-visible:ring-ring/30"
          value={instruction}
          disabled={busy}
          placeholder="例如：主角必须与宿敌合作，却在成功前发现对方隐瞒了关键真相…"
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>
      <div className="flex shrink-0 items-center justify-end gap-2 sm:pb-1">
        <button
          type="button"
          className="rounded-md px-2 py-1.5 text-xs text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          disabled={busy || !ideaIsValid}
          onClick={() => {
            void onSaveIdea(instruction.trim()).then((saved) => { if (saved) setInstruction(""); });
          }}
        >记为草稿</button>
        <Button size="sm" type="submit" variant="primary" loading={busy} disabled={busy}>
          {scope?.kind === "relation" ? "规划关系" : scope?.kind === "stage" ? "完善阶段" : revising ? "预览调整" : selected ? "展开事件" : "生成主线"}
        </Button>
      </div>
    </div>
  </form>;
}
