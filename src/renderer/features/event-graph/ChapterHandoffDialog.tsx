import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EventGraphHandoff, OutlineSnapshot } from "../../../shared/contracts/outline/outlineContracts.ts";
import { AnimatedDialog } from "../../components/motion/index.ts";
import { Button } from "../../components/ui/Button.tsx";
import { DialogFooter, DialogHeader } from "../../components/ui/Dialog.tsx";
import { InlineNotice } from "../../components/ui/Notice.tsx";
import { getErrorMessage } from "../../lib/error.ts";
import { acceptedLeaves, handoffGaps, nextTransitionLeaf } from "./model/chapterMainline.ts";

export default function ChapterHandoffDialog({
  projectId,
  chapterId,
  chapterLabel,
  initialSelection,
  allowWrite,
  onClose,
}: {
  readonly projectId: string;
  readonly chapterId: string;
  readonly chapterLabel: string;
  readonly initialSelection?: readonly string[];
  readonly allowWrite: boolean;
  readonly onClose: () => void;
}) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [readySelection, setReadySelection] = useState(false);
  const [handoff, setHandoff] = useState<EventGraphHandoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initialSelectionKey = initialSelection === undefined ? "*" : initialSelection.join("\u001f");

  useEffect(() => {
    let active = true;
    void window.storyOSAgent.getOutlineSnapshot(projectId).then((next) => {
      if (!active) return;
      setSnapshot(next);
      const leaves = next ? acceptedLeaves(next, chapterId).map((node) => node.id) : [];
      const requested = initialSelectionKey === "*" ? null : new Set(initialSelectionKey.split("\u001f"));
      setSelection(requested === null ? leaves : leaves.filter((id) => requested.has(id)));
      setReadySelection(true);
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause));
    });
    return () => {
      active = false;
    };
  }, [chapterId, projectId, initialSelectionKey]);

  useEffect(() => {
    if (!readySelection) return;
    if (snapshot && acceptedLeaves(snapshot, chapterId).length > 0 && selection.length === 0) {
      setHandoff(null);
      setBusy(false);
      return;
    }
    let active = true;
    setBusy(true);
    setHandoff(null);
    void window.storyOSAgent.loadEventGraphHandoff({ projectId, chapterId, selection }).then((next) => {
      if (active) setHandoff(next);
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause));
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [chapterId, projectId, readySelection, selection, snapshot]);

  const leaves = snapshot ? acceptedLeaves(snapshot, chapterId) : [];
  const selected = leaves.filter((node) => selection.includes(node.id));
  const following = snapshot ? nextTransitionLeaf(snapshot, selection) : null;
  const gaps = handoffGaps(snapshot, chapterId);

  const toggle = (id: string) => {
    setHandoff(null);
    setError(null);
    setSelection((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const waive = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await window.storyOSAgent.waiveChapterMainline({ projectId, chapterId });
      setHandoff(next);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const write = async (mode: "append" | "rewrite", close: () => void) => {
    if (!handoff || (handoff.status !== "ready" && handoff.status !== "waived")) return;
    if (handoff.status === "ready" && (selection.length === 0 || handoff.nodeIds.length !== selection.length ||
      !handoff.nodeIds.every((id) => selection.includes(id)))) {
      setError("选择已变化，请重新预览写作指导。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.storyOSAgent.startChapterWriting({
        projectId,
        chapterId,
        selection,
        mode,
        decision: handoff?.status === "waived" ? "continue" : undefined,
        expectedHandoff: handoff,
      });
      if (result.status === "written") {
        close();
        return;
      }
      if (result.status === "too-large") setError("这次选择的叶子放不进写作预算。请少选几个再预览。");
      else if (result.status === "choice") setError(result.reason === "no-outline" ? "这本书还没有事件图。" : "要先确认叶子，并映射到这一章。");
      else setError(result.proposal.status === "draft" ? result.proposal.summary : "还不能开始写作。");
    } catch (cause) {
      setError(getErrorMessage(cause));
      if (getErrorMessage(cause).includes("写作指导已变化")) {
        try {
          setHandoff(await window.storyOSAgent.loadEventGraphHandoff({ projectId, chapterId, selection }));
        } catch {
          setHandoff(null);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedDialog aria-labelledby="chapter-handoff-title" busy={busy} onClose={onClose} className="max-w-xl rounded-2xl border border-border bg-card shadow-2xl">
      {({ close }) => (
        <div>
          <DialogHeader id="chapter-handoff-title" title={`${chapterLabel}的本章主线`} description="写作指令来自当前正式大纲，预览不会另存一份副本。" onClose={close} busy={busy} />
          <div className="grid max-h-[60vh] gap-3 overflow-auto px-5 py-4 text-sm">
            {leaves.length === 0 && gaps.map((gap) => <p key={gap} className="m-0 text-text-secondary">{gap}</p>)}
            {leaves.map((node) => (
              <label key={node.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg bg-muted px-3 py-2">
                <input type="checkbox" checked={selection.includes(node.id)} onChange={() => toggle(node.id)} disabled={busy} />
                <span>
                  <b>{node.title}</b>
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">目标：{text(node.goal)} · 冲突：{text(node.conflict)} · 结果：{text(node.outcome)}</span>
                </span>
              </label>
            ))}
            {following && <p className="m-0 text-xs leading-5 text-text-secondary">下一叶子「{following.title}」只用于过渡，不在本章展开。{text(following.summary)}</p>}
            {handoff?.status === "ready" && (
              <p className="m-0 text-xs text-text-subtle">大纲修订 {handoff.outlineRevision}。将送入写作器的指令如下。</p>
            )}
            {handoff?.status === "waived" && (
              <InlineNotice tone="warning">本次没有事件图指导。正文不会被说成按主线写成。</InlineNotice>
            )}
            {handoff?.status === "too-large" && (
              <InlineNotice tone="danger">硬约束超过写作预算。减少本次叶子后会重新计算，不会截断后继续写。</InlineNotice>
            )}
            {handoff?.status === "missing" && (
              <p className="m-0 text-xs leading-5 text-text-secondary">{handoff.reason === "no-outline" ? "这本书还没有事件图。" : "这一章还没有可写的已确认叶子。"}</p>
            )}
            {(handoff?.status === "ready" || handoff?.status === "waived") && (
              <pre className="m-0 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-5">{handoff.instruction}</pre>
            )}
            {selected.length === 0 && leaves.length > 0 && <p className="m-0 text-xs text-text-secondary">还没有选中本次要写的叶子。</p>}
            {error && <InlineNotice tone="danger">{error}</InlineNotice>}
          </div>
          <DialogFooter>
            <Button size="sm" disabled={busy} onClick={close}>关闭</Button>
            {handoff?.status === "missing" && allowWrite && (
              <Button size="sm" disabled={busy} onClick={() => navigate(`/projects/${projectId}/events?chapter=${encodeURIComponent(chapterId)}`)}>先去事件图</Button>
            )}
            {handoff?.status === "missing" && allowWrite && (
              <Button size="sm" disabled={busy} onClick={() => void waive()}>仍然写作</Button>
            )}
            {handoff?.status === "ready" && !allowWrite && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => {
                const query = new URLSearchParams({ chapter: chapterId });
                selection.forEach((id) => query.append("nodes", id));
                navigate(`/projects/${projectId}/book?${query.toString()}`);
              }}>前往书籍工作区</Button>
            )}
            {(handoff?.status === "ready" || handoff?.status === "waived") && allowWrite && (
              <>
                <Button size="sm" variant="primary" loading={busy} onClick={() => void write("append", close)}>续写</Button>
                <Button size="sm" loading={busy} onClick={() => void write("rewrite", close)}>重写</Button>
              </>
            )}
          </DialogFooter>
        </div>
      )}
    </AnimatedDialog>
  );
}

function text(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "待定" : trimmed;
}
