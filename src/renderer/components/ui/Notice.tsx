import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils.ts";
import { IconButton } from "./Button.tsx";

const tones = {
  danger: "border-danger-border bg-danger-surface text-danger-text",
  success: "border-success-border bg-success-surface text-success-text",
  warning: "border-warning-border bg-warning-surface text-warning-text",
  info: "border-border bg-muted text-muted-foreground",
};
export function InlineNotice({
  tone = "info",
  children,
  onDismiss,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs",
        tones[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <IconButton
          aria-label="关闭提示"
          className="text-inherit"
          onClick={onDismiss}
        >
          <X size={15} />
        </IconButton>
      )}
    </div>
  );
}
/** Owned by the calling operation; errors are never silently timed out. */
export function Toast(props: Parameters<typeof InlineNotice>[0]) {
  return (
    <InlineNotice
      {...props}
      className={cn(
        "motion-reveal fixed bottom-4 right-4 z-[var(--layer-notification)] max-w-[min(430px,calc(100vw-32px))] shadow-xl",
        props.className,
      )}
    />
  );
}
