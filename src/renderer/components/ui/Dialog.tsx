import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { cn } from "../../../lib/utils.ts";
import { AnimatedDialog } from "../motion/index.ts";
import { Button, IconButton } from "./Button.tsx";

export function DialogHeader({
  id,
  title,
  description,
  onClose,
  busy = false,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  busy?: boolean;
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {onClose && (
        <IconButton aria-label="关闭" disabled={busy} onClick={onClose}>
          <X size={16} />
        </IconButton>
      )}
    </header>
  );
}
export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "flex justify-end gap-2 border-t border-border bg-muted/50 px-5 py-4",
        className,
      )}
    >
      {children}
    </footer>
  );
}
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const confirmed = useRef(false);
  return (
    <AnimatedDialog
      aria-labelledby={id}
      role={danger ? "alertdialog" : "dialog"}
      onClose={() => {
        if (confirmed.current && onConfirm) onConfirm();
        else onClose();
      }}
      className="max-w-md rounded-2xl border border-border bg-card text-foreground shadow-xl"
    >
      {({ close }) => (
        <>
          <DialogHeader id={id} title={title} />
          <div className="whitespace-pre-wrap break-words px-5 py-5 text-sm leading-6 text-muted-foreground">
            {description}
          </div>
          <DialogFooter>
            <Button autoFocus onClick={close}>
              {cancelLabel}
            </Button>
            {onConfirm && (
              <Button
                variant={danger ? "danger" : "primary"}
                onClick={() => {
                  confirmed.current = true;
                  close();
                }}
              >
                {confirmLabel}
              </Button>
            )}
          </DialogFooter>
        </>
      )}
    </AnimatedDialog>
  );
}
