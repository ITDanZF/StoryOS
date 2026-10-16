import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OutlineIssue, OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { Button } from "../../../components/ui/Button.tsx";
import { getErrorMessage } from "../../../lib/error.ts";
import ChapterHandoffDialog from "../../event-graph/ChapterHandoffDialog.tsx";
import { chapterMainline, type MainlineLeaf } from "../../event-graph/model/chapterMainline.ts";

export default function ChapterMainlineBar({
  projectId,
  chapterId,
  chapterLabel,
  chapterRevisionId,
  initialSelection,
}: {
  readonly projectId: string;
  readonly chapterId: string;
  readonly chapterLabel: string;
  readonly chapterRevisionId: string | null;
  readonly initialSelection?: readonly string[];
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [issues, setIssues] = useState<readonly OutlineIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setSnapshot(null);
    setIssues([]);
    setError(null);
    void window.storyOSAgent.getOutlineSnapshot(projectId).then((next) => {
      if (!active) return;
      setSnapshot(next);
      setIssues(next?.issues ?? []);
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause));
    }).finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [chapterId, chapterRevisionId, projectId]);

  const leaves = snapshot ? chapterMainline(snapshot, chapterId, chapterRevisionId) : [];
  const pending = leaves.filter((leaf) => leaf.label === "待核验").length;
  const stale = leaves.filter((leaf) => leaf.label === "需要重新核对").length;
  const chapterIssues = issues.filter((issue) => issue.nodeId !== null && leaves.some((leaf) => leaf.id === issue.nodeId));

  const reload = async () => {
    const next = await window.storyOSAgent.getOutlineSnapshot(projectId);
    setSnapshot(next);
    setIssues(next?.issues ?? []);
    return next;
  };

  const review = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      let current = snapshot;
      const confirmed = chapterMainline(current, chapterId, chapterRevisionId).filter((leaf) =>
        (leaf.status === "confirmed" || leaf.status === "writing" || leaf.status === "covered") &&
        (leaf.coverageStatus === "planned" || leaf.freshness === "stale"),
      );
      if (confirmed.length > 0) {
        if (!chapterRevisionId) {
          setError("这一章还没有可核对的正文修订。");
          return;
        }
        current = await window.storyOSAgent.markNodesPendingVerification({
          projectId,
          expectedRevision: current.outline.revision,
          chapterId,
          nodeIds: confirmed.map((leaf) => leaf.id),
          chapterRevisionId,
        });
      }
      const reviewed = await window.storyOSAgent.reviewChapterCoverage({ projectId, chapterId });
      setSnapshot(reviewed);
      setIssues(reviewed.issues);
    } catch (cause) {
      setError(getErrorMessage(cause));
      try {
        await reload();
      } catch {
        /* 核对失败时保留刚才的错误说明。 */
      }
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (leaf: MainlineLeaf, status: "covered" | "needs_revision") => {
    if (!snapshot || !chapterRevisionId || leaf.freshness !== "current") {
      setError("这份核对已经过期，请重新核对后再确认。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await window.storyOSAgent.updateOutlineNode({
        projectId,
        expectedRevision: snapshot.outline.revision,
        nodeId: leaf.id,
        changes: { status },
        coverageVerification: { chapterId, chapterRevisionId },
      });
      setSnapshot(updated.snapshot);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-b border-border px-4 py-2 sm:px-5 lg:px-7" aria-label="本章主线">
      <div className="flex flex-wrap items-center gap-2">
        <button className="border-0 bg-transparent p-0 text-xs font-semibold" type="button" onClick={() => setOpen((current) => !current)}>
          {open ? "收起本章主线" : "本章主线"}
        </button>
        <span className="text-xs text-text-subtle">
          {!loaded ? "正在读取" : snapshot ? `${leaves.length} 个叶子` : "还没有事件图"}
          {pending > 0 ? ` · ${pending} 个待核验` : ""}
          {stale > 0 ? ` · ${stale} 个需要重新核对` : ""}
        </span>
        <Button size="sm" disabled={busy} onClick={() => setHandoffOpen(true)}>查看写作指导</Button>
        {snapshot && <Button size="sm" loading={busy} onClick={() => void review()}>核对本节事件</Button>}
        {loaded && !snapshot && (
          <Button size="sm" onClick={() => navigate(`/projects/${projectId}/events`)}>先去事件图</Button>
        )}
      </div>
      {open && (
        <ul className="mt-2 grid gap-2">
          {leaves.map((leaf) => (
            <li key={leaf.id} className="rounded-lg bg-muted px-3 py-2 text-xs leading-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="border-0 bg-transparent p-0 font-semibold"
                  type="button"
                  onClick={() => navigate(`/projects/${projectId}/events?chapter=${encodeURIComponent(chapterId)}&node=${encodeURIComponent(leaf.id)}`)}
                >
                  {leaf.title}
                </button>
                <span className="text-text-subtle">{leaf.label}</span>
              </div>
              <p className="m-0 text-text-secondary">本章片段：{text(leaf.segmentIntent)} · 本章变化：{text(leaf.expectedLocalChange)}</p>
              {leaf.label === "待核验" && (
                <span className="mt-1 flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void setStatus(leaf, "covered")}>确认已写到</Button>
                  <Button size="sm" disabled={busy} onClick={() => void setStatus(leaf, "needs_revision")}>标为需修订</Button>
                </span>
              )}
              {leaf.status === "needs_revision" && (
                <button
                  className="mt-1 border-0 bg-transparent p-0 text-accent-foreground"
                  type="button"
                  onClick={() => navigate(`/projects/${projectId}/events?chapter=${encodeURIComponent(chapterId)}&node=${encodeURIComponent(leaf.id)}`)}
                >
                  查看对后续主线的影响
                </button>
              )}
            </li>
          ))}
          {chapterIssues.map((issue) => (
            <li key={issue.id} className="text-xs leading-5 text-text-secondary">
              {issue.stale ? "过期建议" : "核对建议"}：{issue.message}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
      {handoffOpen && (
        <ChapterHandoffDialog
          key={`${projectId}:${chapterId}`}
          projectId={projectId}
          chapterId={chapterId}
          chapterLabel={chapterLabel}
          initialSelection={initialSelection}
          allowWrite
          onClose={() => {
            setHandoffOpen(false);
            void reload().catch((cause: unknown) => setError(getErrorMessage(cause)));
          }}
        />
      )}
    </section>
  );
}

function text(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "待定" : trimmed;
}
