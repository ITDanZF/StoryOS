import { useEffect, useState } from "react";
import type { GraphWritingPlan } from "../../../shared/contracts/outline/outlineContracts.ts";
import { AnimatedDialog } from "../../components/motion/index.ts";
import { Button } from "../../components/ui/Button.tsx";
import { DialogFooter, DialogHeader } from "../../components/ui/Dialog.tsx";

type Scope = GraphWritingPlan["scope"];
type Props = {
  readonly projectId: string;
  readonly options: readonly { readonly scope: Scope; readonly label: string }[];
  readonly initialScope: Scope | null;
  readonly plan: GraphWritingPlan | null;
  readonly busy: boolean;
  readonly running: boolean;
  readonly onClose: () => void;
  readonly onPreview: (scope: Scope, chapterIds: readonly string[] | undefined, rewriteChapterIds: readonly string[]) => Promise<boolean>;
  readonly onStart: () => Promise<boolean>;
  readonly onCancel: () => Promise<void>;
};

export default function EventGraphWritingDialog({ projectId, options, initialScope, plan, busy, running, onClose, onPreview, onStart, onCancel }: Props) {
  const [scopeKey, setScopeKey] = useState(initialScope ? `${initialScope.kind}:${initialScope.id}` : "");
  const [rewriteIds, setRewriteIds] = useState<readonly string[]>([]);
  const [includedChapterIds, setIncludedChapterIds] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (plan && `${plan.scope.kind}:${plan.scope.id}` === scopeKey) {
      setRewriteIds(plan.steps.filter((step) => step.mode === "rewrite").map((step) => step.chapterId));
      setIncludedChapterIds(plan.steps.filter((step) => step.state !== "saved").map((step) => step.chapterId));
    }
  }, [plan, scopeKey]);
  const scope = options.find((option) => `${option.scope.kind}:${option.scope.id}` === scopeKey)?.scope;
  const selectedPlan = plan && scope && plan.scope.kind === scope.kind && plan.scope.id === scope.id ? plan : null;
  const rewriteChanged = selectedPlan?.steps.some((step) => (step.mode === "rewrite") !== rewriteIds.includes(step.chapterId)) ?? false;
  const chaptersChanged = selectedPlan?.steps.some((step) => step.state !== "saved" && !includedChapterIds?.includes(step.chapterId)) ?? false;
  const canStart = selectedPlan && ["previewed", "partial", "failed", "running"].includes(selectedPlan.status) && selectedPlan.steps.some((step) => step.state !== "saved" || step.errorCode === "coverage_pending");
  return <AnimatedDialog aria-labelledby="event-graph-writing-title" busy={busy} onClose={onClose} className="max-h-[90vh] max-w-3xl overflow-auto rounded-2xl border border-border bg-card shadow-2xl">
    {({ close }) => <>
      <DialogHeader id="event-graph-writing-title" title="从事件图生成正文" description="先核对范围、章节片段和写作模式。结果保存为书籍工作区的章节修订。" onClose={close} busy={busy} />
      <div className="grid gap-4 px-5 py-4">
        <label className="grid gap-1 text-xs text-text-secondary">生成范围
          <select className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={scopeKey} disabled={busy || running} onChange={(event) => { setScopeKey(event.target.value); setRewriteIds([]); setIncludedChapterIds(null); }}>
            <option value="">选择事件或阶段</option>
            {options.map((option) => <option key={`${option.scope.kind}:${option.scope.id}`} value={`${option.scope.kind}:${option.scope.id}`}>{option.label}</option>)}
          </select>
        </label>
        {scope && <Button size="sm" disabled={busy || running || includedChapterIds?.length === 0 && selectedPlan?.status !== "completed"} loading={busy} onClick={() => void onPreview(scope, selectedPlan?.status === "completed" ? undefined : includedChapterIds ?? undefined, selectedPlan?.status === "completed" ? [] : rewriteIds.filter((id) => !includedChapterIds || includedChapterIds.includes(id)))}>{selectedPlan?.status === "completed" ? "重新预览全部章节" : "预览章节计划"}</Button>}
        {selectedPlan && <>
          <p className="m-0 text-xs text-text-secondary">状态：{statusLabel(selectedPlan.status)} · {selectedPlan.steps.length} 章 · 图修订 {selectedPlan.outlineRevision}</p>
          {selectedPlan.skippedNodeIds.length > 0 && <p className="m-0 rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-text-secondary">跳过 {selectedPlan.skippedNodeIds.length} 个尚未确认或缺少章节片段的事件。本次只写下列章节。</p>}
          <div className="grid gap-2">
            {selectedPlan.steps.map((step) => <div key={step.stepId} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{step.chapterTitle}</b><span className="text-xs text-text-secondary">{step.state === "saved" ? "已保存" : step.state === "failed" ? "失败" : step.state === "running" ? "生成中" : "待生成"} · {step.nodeIds.length} 个事件</span></div>
              {step.state !== "saved" && <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={includedChapterIds?.includes(step.chapterId) ?? true} disabled={busy || running} onChange={(event) => setIncludedChapterIds((current) => event.target.checked ? [...(current ?? []), step.chapterId] : (current ?? []).filter((id) => id !== step.chapterId))} />本次生成这一章</label>}
              <p className="my-2 text-xs text-text-secondary">{step.nodeIds.join("、")}</p>
              {step.state !== "saved" && <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={rewriteIds.includes(step.chapterId)} disabled={busy || running} onChange={(event) => setRewriteIds((current) => event.target.checked ? [...current, step.chapterId] : current.filter((id) => id !== step.chapterId))} />改写本章完整正文（默认续写）</label>}
              <p className="mb-0 mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{step.instruction}</p>
              {step.savedRevisionId && <a className="mt-2 inline-block text-xs text-accent-foreground underline" href={`#/projects/${projectId}/book?chapter=${encodeURIComponent(step.chapterId)}`}>打开已保存章节</a>}
          {step.errorCode && <p className="m-0 mt-2 text-xs text-danger-text">{step.errorCode === "coverage_pending" ? "正文已保存，覆盖状态待补；继续时只补状态，不重复生成。" : step.errorCode === "chapter_changed_after_save" ? "正文已保存，但章节后来改变。" : "本章未完成，请核对当前正文与主线。"}</p>}
            </div>)}
          </div>
          {(rewriteChanged || chaptersChanged) && <p className="m-0 text-xs text-text-secondary">章节范围或改写选项有变动，请先重新预览计划。</p>}
        </>}
      </div>
      <DialogFooter>
        <Button size="sm" disabled={busy} onClick={close}>关闭</Button>
        {running && selectedPlan && <Button size="sm" variant="danger" onClick={() => void onCancel()}>停止后续章节</Button>}
        {canStart && !running && <Button size="sm" variant="primary" disabled={busy || rewriteChanged || chaptersChanged} onClick={() => void onStart()}>{selectedPlan?.status === "previewed" ? "开始生成" : selectedPlan?.steps.every((step) => step.state === "saved") ? "补记覆盖状态" : "继续未完成章节"}</Button>}
      </DialogFooter>
    </>}
  </AnimatedDialog>;
}

function statusLabel(status: GraphWritingPlan["status"]): string {
  return { previewed: "待确认", running: "执行中", completed: "已完成", partial: "部分完成", failed: "失败", cancelled: "已取消" }[status];
}
