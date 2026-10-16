import type { OutlineProposal } from "../../../shared/contracts/outline/outlineContracts.ts";
import { Button } from "../../components/ui/Button.tsx";
import { Input } from "../../components/ui/Field.tsx";
import type { ProposalReading } from "./model/proposalDiff.ts";

export default function EventGraphProposal({
  proposal,
  reading,
  conflict,
  busy,
  onEdit,
  onAccept,
  onDiscard,
  onRegenerate,
}: {
  readonly proposal: OutlineProposal;
  readonly reading: ProposalReading | null;
  readonly conflict: { readonly expectedRevision: number; readonly currentRevision: number } | null;
  readonly busy: boolean;
  readonly onEdit: (index: number, field: "title" | "goal" | "conflict" | "outcome", value: string) => void;
  readonly onAccept: () => void;
  readonly onDiscard: () => void;
  readonly onRegenerate: () => void;
}) {
  return (
    <section className="border-b border-border px-4 py-3" aria-label="主线候选">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-[11px] font-semibold text-text-subtle">待确认的主线候选</p>
          <h2 className="m-0 text-sm font-semibold">{proposal.status === "draft" ? proposal.summary || "一份候选" : "这份候选还不能用"}</h2>
        </div>
        <span className="flex shrink-0 gap-1">
          <Button size="sm" disabled={busy} onClick={onDiscard}>放弃</Button>
          <Button size="sm" disabled={busy} onClick={onRegenerate}>重新生成</Button>
          {proposal.status === "draft" && !conflict && (
            <Button size="sm" variant="primary" loading={busy} onClick={onAccept}>接受整份</Button>
          )}
        </span>
      </div>
      {conflict && (
        <p className="mt-2 text-xs leading-5 text-danger-text">
          候选基于修订 {conflict.expectedRevision}，当前大纲已是修订 {conflict.currentRevision}。正式节点没有被覆盖。
        </p>
      )}
      {proposal.status === "repairable" && (
        <ul className="mt-2 grid gap-1 pl-4 text-xs leading-5 text-danger-text">
          {proposal.problems.map((problem) => <li key={`${problem.tempId ?? "problem"}:${problem.message}`}>{problem.message}</li>)}
        </ul>
      )}
      {reading && (
        <ul className="mt-2 grid gap-2">
          {reading.entries.map((entry) => (
            <li key={entry.index} className="rounded-lg bg-muted px-2 py-2 text-xs leading-5">
              <b>{kindLabel(entry.kind)} · {entry.title}</b>
              {entry.values && entry.editable && proposal.status === "draft" ? (
                <div className="mt-1 grid gap-1">
                  <Field label="名称" value={entry.values.title} disabled={busy} onChange={(value) => onEdit(entry.index, "title", value)} />
                  <Field label="目标" value={entry.values.goal} disabled={busy} onChange={(value) => onEdit(entry.index, "goal", value)} />
                  <Field label="冲突" value={entry.values.conflict} disabled={busy} onChange={(value) => onEdit(entry.index, "conflict", value)} />
                  <Field label="结果" value={entry.values.outcome} disabled={busy} onChange={(value) => onEdit(entry.index, "outcome", value)} />
                </div>
              ) : entry.lines.map((line) => <p key={line} className="m-0 text-text-secondary">{line}</p>)}
            </li>
          ))}
          {reading.affectedChapters.length > 0 && (
            <li className="text-xs text-text-secondary">预计影响 {reading.affectedChapters.length} 个章节里的已有事件。</li>
          )}
        </ul>
      )}
    </section>
  );
}

function kindLabel(kind: ProposalReading["entries"][number]["kind"]): string {
  if (kind === "create") return "新增";
  if (kind === "update") return "修改";
  if (kind === "relation") return "关系";
  if (kind === "promise") return "承诺";
  if (kind === "delete") return "删除";
  return "其他";
}

function Field({ label, value, disabled, onChange }: {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-text-subtle">{label}
      <Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
