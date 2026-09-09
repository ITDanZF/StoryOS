import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../../../lib/utils.ts";
import type {
  PendingToolApprovalView,
  ResolveToolApproval,
} from "../../types.ts";

type ApprovalComposerProps = {
  readonly approval: PendingToolApprovalView;
  readonly className?: string;
  readonly onResolve: ResolveToolApproval;
};

export default function ApprovalComposer({
  approval,
  className,
  onResolve,
}: ApprovalComposerProps) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (decision: Parameters<ResolveToolApproval>[1]) => {
    if (resolving) return;
    setResolving(true);
    setError(null);
    try {
      await onResolve(approval.approvalId, decision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setResolving(false);
    }
  };

  return (
    <section
      className={cn(
        "z-20 overflow-hidden rounded-[18px] border border-warning-border bg-card/98 shadow-[0_16px_42px_rgba(35,30,18,0.14)] backdrop-blur-xl",
        className,
      )}
      aria-label="工具执行确认"
      data-approval-composer={approval.approvalId}
    >
      <header className="flex items-center gap-2 border-b border-warning-border bg-warning-surface/80 px-3.5 py-2 text-[11px] font-medium text-warning-text">
        <ShieldAlert size={14} />
        等待你的确认
      </header>
      <div className="max-h-44 overflow-y-auto px-3.5 py-3" tabIndex={0}>
        <div className="text-xs font-medium leading-5 text-foreground">
          {approval.summary}
        </div>
        {approval.preview && (
          <pre className="mb-0 mt-2 whitespace-pre-wrap break-words rounded-xl bg-surface-subtle p-2.5 font-mono text-[10px] leading-4 text-text-secondary">
            {approval.preview}
          </pre>
        )}
      </div>
      {error && <div className="mx-3 mb-2 rounded-lg bg-danger-surface px-2.5 py-2 text-[10px] text-danger-text">{error}</div>}
      <footer className="flex flex-wrap justify-end gap-1.5 border-t border-border px-3 py-2.5">
        <button className="h-8 rounded-lg border border-border bg-card px-3 text-[11px] text-text-secondary hover:bg-surface-subtle disabled:opacity-50" disabled={resolving} type="button" onClick={() => void resolve("deny")}>拒绝</button>
        <button className="h-8 rounded-lg bg-accent px-3 text-[11px] text-accent-foreground hover:bg-accent disabled:opacity-50" disabled={resolving} type="button" onClick={() => void resolve("allow_once")}>允许一次</button>
        <button className="h-8 rounded-lg bg-primary px-3 text-[11px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50" disabled={resolving} type="button" onClick={() => void resolve("allow_session")}>本次会话允许</button>
      </footer>
    </section>
  );
}
