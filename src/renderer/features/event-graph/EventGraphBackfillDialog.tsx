import { useEffect, useState } from "react";
import type { BackfillAcceptancePreview, BackfillScan } from "../../../shared/contracts/outline/outlineContracts.ts";
import { AnimatedDialog } from "../../components/motion/index.ts";
import { Button } from "../../components/ui/Button.tsx";
import { DialogFooter, DialogHeader } from "../../components/ui/Dialog.tsx";

type Props = {
  readonly projectId: string;
  readonly scan: BackfillScan | null;
  readonly chapterId: string | null;
  readonly volumes: readonly { readonly id: string; readonly title: string }[];
  readonly nodeTitles: Readonly<Record<string, string>>;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onScan: (chapterIds?: readonly string[], volumeId?: string) => Promise<boolean>;
  readonly onCancel: () => Promise<void>;
  readonly onPreview: (scanId: string, candidateIds: readonly string[], confirmedUncertainIds: readonly string[], applySuggestedUpdatesFor: readonly string[]) => Promise<BackfillAcceptancePreview | null>;
  readonly onAccept: (scanId: string, candidateIds: readonly string[], confirmedUncertainIds: readonly string[], applySuggestedUpdatesFor: readonly string[]) => Promise<boolean>;
};

export default function EventGraphBackfillDialog({ projectId, scan, chapterId, volumes, nodeTitles, busy, onClose, onScan, onCancel, onPreview, onAccept }: Props) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [volumeId, setVolumeId] = useState("");
  const [confirmedUncertain, setConfirmedUncertain] = useState<readonly string[]>([]);
  const [applyUpdates, setApplyUpdates] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<BackfillAcceptancePreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  useEffect(() => { setSelected([]); setConfirmedUncertain([]); setApplyUpdates([]); setPreview(null); setPreviewKey(""); }, [scan?.scanId]);
  const available = scan?.candidates.filter((candidate) => !candidate.acceptedNodeId) ?? [];
  const chosenUncertain = selected.filter((id) => confirmedUncertain.includes(id));
  const chosenUpdates = selected.filter((id) => applyUpdates.includes(id));
  const selectionKey = JSON.stringify([scan?.scanId, [...selected].sort(), [...chosenUncertain].sort(), [...chosenUpdates].sort()]);
  const readyPreview = preview && previewKey === selectionKey && scan?.status === "ready" ? preview : null;
  const submitting = busy && scan?.status !== "scanning";
  return <AnimatedDialog aria-labelledby="event-backfill-title" busy={submitting} onClose={onClose} className="max-h-[90vh] max-w-3xl overflow-auto rounded-2xl border border-border bg-card shadow-2xl">
    {({ close }) => <>
      <DialogHeader id="event-backfill-title" title="从已有正文补事件" description="扫描当前正式章节，先审阅候选和正文证据，再写入事件图。" onClose={close} busy={submitting} />
      <div className="grid gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={busy} disabled={busy || scan?.status === "scanning"} onClick={() => void onScan(chapterId ? [chapterId] : undefined)}>{chapterId ? "扫描当前章" : "扫描全书正文"}</Button>
          {chapterId && <Button size="sm" disabled={busy || scan?.status === "scanning"} onClick={() => void onScan()}>扫描全书</Button>}
          {volumes.length > 0 && <select aria-label="选择扫描卷" className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground" value={volumeId} disabled={busy || scan?.status === "scanning"} onChange={(event) => setVolumeId(event.target.value)}><option value="">选择卷</option>{volumes.map((volume) => <option key={volume.id} value={volume.id}>{volume.title}</option>)}</select>}
          {volumeId && <Button size="sm" disabled={busy || scan?.status === "scanning"} onClick={() => void onScan(undefined, volumeId)}>扫描所选卷</Button>}
          {scan && <span className="text-xs text-text-secondary">{scan.chapterInputs.length} 章 · {scan.candidates.length} 条候选 · 图修订 {scan.outlineRevision}</span>}
          {scan?.status === "scanning" && <Button size="sm" variant="danger" onClick={() => void onCancel()}>停止扫描</Button>}
        </div>
        {scan?.status === "scanning" && <p className="m-0 text-xs text-text-secondary">正在逐章提取 · 已完成 {scan.completedChapterIds.length}/{scan.chapterInputs.length} 章。关闭页面后可重新查看进度。</p>}
        {scan?.status === "cancelled" && <p className="m-0 text-xs text-text-secondary">扫描已停止。已完成章节的候选保留，可重新扫描后接受。</p>}
        {scan?.status === "failed" && <p className="m-0 text-xs text-danger-text">扫描中断。已完成章节的候选保留；请重试。</p>}
        {scan?.status === "stale" && <p className="m-0 rounded-lg border border-warning-border bg-warning-surface p-3 text-xs text-warning-text">扫描时主线已改变，请重新扫描后接受。</p>}
        {!scan && <p className="m-0 text-sm leading-6 text-text-secondary">建议先保存书籍工作区中的正文。扫描只读取正式修订，不读取未保存草稿。</p>}
        {scan && scan.candidates.length === 0 && <p className="m-0 text-sm text-text-secondary">本次未找到可提取的事件。</p>}
        {scan?.candidates.map((candidate) => {
          const created = candidate.patchOperations.find((operation) => operation.type === "create_node");
          const title = candidate.displayTitle ?? created?.value.title ?? candidate.matchedNodeId ?? "待确认事件";
          const relationTitle = (id: string) => id === created?.tempId ? title : nodeTitles[id] ?? id;
          const disabled = Boolean(candidate.acceptedNodeId) || scan.status !== "ready" || candidate.disposition === "uncertain" && !confirmedUncertain.includes(candidate.candidateId);
          return <div key={candidate.candidateId} className="grid gap-2 rounded-xl border border-border bg-background p-3">
            <span className="flex items-start gap-2">
              <input type="checkbox" aria-label={`接受候选：${title}`} className="mt-1 accent-accent" disabled={disabled || busy} checked={selected.includes(candidate.candidateId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.candidateId] : current.filter((id) => id !== candidate.candidateId))} />
              <span className="min-w-0"><b className="block text-sm">{title}</b><span className="text-xs text-text-secondary">{candidate.acceptedNodeId ? "已接受" : candidate.disposition === "uncertain" ? "证据待确认" : candidate.disposition === "update-suggested" ? "已有节点有新事实" : candidate.disposition === "matched" ? "补已有节点映射" : "新增事件"} · {candidate.mappingChanges.length} 章</span></span>
            </span>
            <p className="m-0 text-xs leading-5 text-text-secondary">{candidate.explanation}</p>
            {created && <div className="grid gap-1 rounded-lg bg-muted p-3 text-xs leading-5 text-text-secondary">
              <p className="m-0"><b className="text-foreground">目标：</b>{created.value.goal || "正文未说明"}</p>
              <p className="m-0"><b className="text-foreground">冲突：</b>{created.value.conflict || "正文未说明"}</p>
              <p className="m-0"><b className="text-foreground">结果：</b>{created.value.outcome || "正文未说明"}</p>
            </div>}
            {candidate.fieldDiff?.length > 0 && <div className="grid gap-1 rounded-lg bg-muted p-3 text-xs leading-5 text-text-secondary">
              <b className="text-foreground">可选的节点事实更新</b>
              {candidate.fieldDiff.map((diff) => <p key={diff.field} className="m-0">{({ summary: "摘要", goal: "目标", conflict: "冲突", outcome: "结果" } as const)[diff.field]}：{diff.before || "未写"} → {diff.after}</p>)}
              {!candidate.acceptedNodeId && <label className="mt-1 flex items-center gap-2 text-foreground"><input type="checkbox" checked={applyUpdates.includes(candidate.candidateId)} onChange={(event) => setApplyUpdates((current) => event.target.checked ? [...current, candidate.candidateId] : current.filter((id) => id !== candidate.candidateId))} />同时更新已有节点事实；不勾选时只补章节片段和证据</label>}
            </div>}
            {candidate.patchOperations.filter((operation) => operation.type === "upsert_relation").map((operation) => <p key={`${operation.value.sourceNodeId}:${operation.value.targetNodeId}:${operation.value.type}`} className="m-0 rounded-lg border border-border px-3 py-2 text-xs leading-5 text-text-secondary">建议关系：{relationTitle(operation.value.sourceNodeId)} → {relationTitle(operation.value.targetNodeId)} · {({ causes: "因果", requires: "前提", reveals: "揭示", foreshadows: "伏笔", contrasts: "对照" } as const)[operation.value.type]}<br />依据：{operation.value.description}</p>)}
            <div className="grid gap-1 text-xs leading-5 text-text-secondary">
              {candidate.mappingChanges.map((mapping) => <p key={`${mapping.chapterId}:${mapping.nodeRef}`} className="m-0">章节 {mapping.chapterId}：{mapping.segmentIntent} → {mapping.expectedLocalChange}</p>)}
            </div>
            {candidate.disposition === "uncertain" && !candidate.acceptedNodeId && <label className="flex items-center gap-2 text-xs text-warning-text"><input type="checkbox" checked={confirmedUncertain.includes(candidate.candidateId)} onChange={(event) => setConfirmedUncertain((current) => event.target.checked ? [...current, candidate.candidateId] : current.filter((id) => id !== candidate.candidateId))} />我已核对原文，同意按草稿事件加入</label>}
            {candidate.evidence.map((evidence) => <div key={`${evidence.chapterId}:${evidence.startOffset}`} className="rounded-lg border-l-2 border-accent-border bg-muted px-3 py-2 text-xs leading-5">
              <a className="text-accent-foreground underline" href={`#/projects/${projectId}/book?chapter=${encodeURIComponent(evidence.chapterId)}`}>打开来源章节</a>
              <span className="ml-2 text-text-subtle">修订 {evidence.revisionId.slice(0, 8)} · 字符 {evidence.startOffset}–{evidence.endOffset}</span>
              <p className="m-0 mt-1 text-foreground">「{evidence.excerpt}」</p>
            </div>)}
          </div>;
        })}
        {readyPreview && <div className="rounded-xl border border-accent-border bg-muted p-3 text-xs leading-5 text-text-secondary">接受预览：{readyPreview.operations.filter((operation) => operation.type === "create_node").length} 个新事件、{readyPreview.operations.filter((operation) => operation.type === "update_node").length} 项已有节点更新、{readyPreview.operations.filter((operation) => operation.type === "upsert_relation").length} 条关系、{readyPreview.mappingChanges.length} 条章节片段、{readyPreview.evidence.length} 条正文证据。正式图仍未改变。</div>}
      </div>
      <DialogFooter>
        <Button size="sm" disabled={submitting} onClick={close}>关闭</Button>
        <Button size="sm" disabled={busy || !scan || scan.status !== "ready" || selected.length === 0 || available.length === 0} onClick={() => { if (scan) void onPreview(scan.scanId, selected, chosenUncertain, chosenUpdates).then((result) => { setPreview(result); setPreviewKey(result ? selectionKey : ""); }); }}>预览所选改动</Button>
        <Button size="sm" variant="primary" loading={busy} disabled={busy || !readyPreview} onClick={() => { if (scan) void onAccept(scan.scanId, selected, chosenUncertain, chosenUpdates).then((accepted) => { if (accepted) { setSelected([]); setPreview(null); } }); }}>接受所选候选</Button>
      </DialogFooter>
    </>}
  </AnimatedDialog>;
}
