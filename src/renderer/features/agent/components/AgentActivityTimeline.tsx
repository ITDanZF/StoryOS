import {
  CheckCircle2,
  ChevronDown,
  CircleEllipsis,
  Clock3,
  ShieldAlert,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ToolApprovalDecision } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import type {
  PendingToolApprovalView,
  ToolActivityView,
} from "../types.ts";

type AgentActivityTimelineProps = {
  readonly approvals: readonly PendingToolApprovalView[];
  readonly activities: readonly ToolActivityView[];
  readonly compact?: boolean;
  readonly defaultOpen?: boolean;
  readonly title?: string;
  readonly onResolveApproval: (
    approvalId: string,
    decision: ToolApprovalDecision,
  ) => Promise<void>;
};

type TimelineItem =
  | {
      readonly kind: "activity";
      readonly id: string;
      readonly runId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly status: ToolActivityView["status"];
      readonly error?: string;
      readonly timestamp: string;
    }
  | {
      readonly kind: "approval";
      readonly id: string;
      readonly approvalId: string;
      readonly runId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly preview: string;
      readonly timestamp: string;
    };

const statusLabel: Record<ToolActivityView["status"], string> = {
  approved: "已批准",
  completed: "已完成",
  failed: "失败",
  rejected: "已拒绝",
  started: "执行中",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: ToolActivityView["status"]) {
  if (status === "failed" || status === "rejected") return "border-red-100 bg-red-50 text-red-700";
  if (status === "completed" || status === "approved") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  return "border-violet-100 bg-violet-50 text-violet-700";
}

function ActivityIcon({ status }: { readonly status: ToolActivityView["status"] }) {
  if (status === "completed" || status === "approved") return <CheckCircle2 size={14} />;
  if (status === "failed" || status === "rejected") return <XCircle size={14} />;
  return <CircleEllipsis className="animate-pulse motion-reduce:animate-none" size={14} />;
}

export default function AgentActivityTimeline({
  approvals,
  activities,
  compact = false,
  defaultOpen,
  title = "执行过程",
  onResolveApproval,
}: AgentActivityTimelineProps) {
  const [open, setOpen] = useState(defaultOpen ?? approvals.length > 0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const items = useMemo<TimelineItem[]>(() => [
    ...activities.map((activity): TimelineItem => ({
      kind: "activity",
      id: activity.id,
      runId: activity.runId,
      toolName: activity.toolName,
      summary: activity.summary,
      status: activity.status,
      ...(activity.error ? { error: activity.error } : {}),
      timestamp: activity.updatedAt,
    })),
    ...approvals.map((approval): TimelineItem => ({
      kind: "approval",
      id: approval.approvalId,
      approvalId: approval.approvalId,
      runId: approval.runId,
      toolName: approval.toolName,
      summary: approval.summary,
      preview: approval.preview,
      timestamp: approval.requestedAt,
    })),
  ].sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp)), [activities, approvals]);

  if (items.length === 0) return null;

  const runningCount = activities.filter((activity) => activity.status === "started").length;
  const failedCount = activities.filter((activity) => activity.status === "failed" || activity.status === "rejected").length;
  const completedCount = activities.filter((activity) => activity.status === "completed" || activity.status === "approved").length;

  const resolve = async (approvalId: string, decision: ToolApprovalDecision) => {
    setResolvingId(approvalId);
    try {
      await onResolveApproval(approvalId, decision);
    } catch {
      // The workspace hook exposes the failure through its shared error state.
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className={cn("overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow-sm", compact ? "text-[10px]" : "text-[11px]") }>
      <button
        className="flex w-full items-center justify-between gap-3 border-0 bg-neutral-50/80 px-3 py-2.5 text-left text-neutral-600 hover:bg-neutral-100"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-neutral-900 text-white">
            <Sparkles size={13} />
          </span>
          <span className="min-w-0">
            <strong className="block truncate font-semibold text-neutral-800">{title}</strong>
            <span className="mt-0.5 flex flex-wrap gap-1.5 text-[9px] text-neutral-400">
              {runningCount > 0 && <span>{runningCount} 个执行中</span>}
              {completedCount > 0 && <span>{completedCount} 个已完成</span>}
              {approvals.length > 0 && <span>{approvals.length} 个待确认</span>}
              {failedCount > 0 && <span>{failedCount} 个异常</span>}
            </span>
          </span>
        </span>
        <ChevronDown className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} size={15} />
      </button>

      {open && (
        <div className="space-y-3 px-3 py-3">
          {items.map((item, index) => (
            <div className="relative pl-7" key={item.id}>
              {index < items.length - 1 && <span className="absolute bottom-[-12px] left-[10px] top-6 w-px bg-neutral-200" />}
              <span className={cn("absolute left-0 top-0 grid size-5 place-items-center rounded-full border bg-white", item.kind === "approval" ? "border-amber-200 text-amber-600" : "border-neutral-200 text-neutral-500")}>
                {item.kind === "approval" ? <ShieldAlert size={12} /> : <Wrench size={12} />}
              </span>

              {item.kind === "approval" ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950 shadow-sm">
                  <header className="flex items-center justify-between gap-2">
                    <strong className="min-w-0 truncate text-[11px]">{item.summary || item.toolName}</strong>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[9px] text-amber-700">
                      <Clock3 size={10} />{formatTime(item.timestamp)}
                    </span>
                  </header>
                  {item.preview && (
                    <pre className="mb-0 mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-100 bg-white/80 p-2 font-mono text-[9px] leading-4 text-neutral-600">
                      {item.preview}
                    </pre>
                  )}
                  <footer className="mt-3 flex flex-wrap justify-end gap-1.5">
                    <button className="h-7 rounded-lg border border-amber-200 bg-white px-2.5 text-[9px] hover:bg-amber-100 disabled:opacity-50" type="button" disabled={resolvingId !== null} onClick={() => void resolve(item.approvalId, "deny")}>拒绝</button>
                    <button className="h-7 rounded-lg border-0 bg-amber-200 px-2.5 text-[9px] hover:bg-amber-300 disabled:opacity-50" type="button" disabled={resolvingId !== null} onClick={() => void resolve(item.approvalId, "allow_once")}>允许一次</button>
                    <button className="h-7 rounded-lg border-0 bg-neutral-900 px-2.5 text-[9px] text-white hover:bg-black disabled:opacity-50" type="button" disabled={resolvingId !== null} onClick={() => void resolve(item.approvalId, "allow_session")}>本次会话允许</button>
                  </footer>
                </section>
              ) : (
                <section className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-2.5">
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-700">{item.summary || item.toolName}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[9px] text-neutral-400">
                        <span>{item.toolName}</span>
                        <span>·</span>
                        <span>{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px]", statusTone(item.status))}>
                      <ActivityIcon status={item.status} />{statusLabel[item.status]}
                    </span>
                  </header>
                  {item.error && <p className="mb-0 mt-2 rounded-lg bg-red-100/70 p-2 leading-4 text-red-700">{item.error}</p>}
                </section>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
