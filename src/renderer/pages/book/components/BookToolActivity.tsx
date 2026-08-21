import {
  CheckCircle2,
  CircleEllipsis,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { ToolApprovalDecision } from "../../../../shared/agent/contracts.ts";
import type {
  PendingToolApprovalView,
  ToolActivityView,
} from "../../../features/agent/types.ts";
import { cn } from "../../../../lib/utils.ts";

type BookToolActivityProps = {
  readonly approvals: readonly PendingToolApprovalView[];
  readonly activities: readonly ToolActivityView[];
  readonly onResolveApproval: (
    approvalId: string,
    decision: ToolApprovalDecision,
  ) => Promise<void>;
};

export default function BookToolActivity({
  approvals,
  activities,
  onResolveApproval,
}: BookToolActivityProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const resolve = async (
    approvalId: string,
    decision: ToolApprovalDecision,
  ) => {
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
    <div className="grid gap-2.5">
      {activities.slice(-3).map((activity) => (
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 text-[10px]",
            activity.status === "failed" || activity.status === "rejected"
              ? "border-red-100 bg-red-50 text-red-700"
              : activity.status === "completed"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 bg-neutral-50 text-neutral-600",
          )}
          key={activity.id}
        >
          <div className="flex items-center gap-2 font-medium">
            {activity.status === "completed"
              ? <CheckCircle2 size={13} />
              : activity.status === "failed" || activity.status === "rejected"
                ? <XCircle size={13} />
                : <CircleEllipsis className="animate-pulse" size={13} />}
            <span>{activity.summary || activity.toolName}</span>
          </div>
          {activity.error && <p className="mb-0 mt-1 leading-4">{activity.error}</p>}
        </div>
      ))}

      {approvals.map((approval) => (
        <section
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950 shadow-sm"
          key={approval.approvalId}
        >
          <header className="flex items-center gap-2 text-[11px] font-semibold">
            <ShieldAlert size={15} />
            AI 请求执行操作
          </header>
          <p className="mb-0 mt-2 text-[10px] leading-5">
            {approval.summary || approval.toolName}
          </p>
          {approval.preview && (
            <pre className="mb-0 mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-100 bg-white/70 p-2 text-[9px] leading-4 text-neutral-600">
              {approval.preview}
            </pre>
          )}
          <footer className="mt-3 flex flex-wrap justify-end gap-1.5">
            <button
              className="h-7 rounded-lg border border-amber-200 bg-white px-2.5 text-[9px] hover:bg-amber-100 disabled:opacity-50"
              type="button"
              disabled={resolvingId !== null}
              onClick={() => void resolve(approval.approvalId, "deny")}
            >
              拒绝
            </button>
            <button
              className="h-7 rounded-lg border-0 bg-amber-200 px-2.5 text-[9px] hover:bg-amber-300 disabled:opacity-50"
              type="button"
              disabled={resolvingId !== null}
              onClick={() => void resolve(approval.approvalId, "allow_once")}
            >
              允许一次
            </button>
            <button
              className="h-7 rounded-lg border-0 bg-neutral-900 px-2.5 text-[9px] text-white hover:bg-black disabled:opacity-50"
              type="button"
              disabled={resolvingId !== null}
              onClick={() => void resolve(approval.approvalId, "allow_session")}
            >
              本次会话允许
            </button>
          </footer>
        </section>
      ))}
    </div>
  );
}
