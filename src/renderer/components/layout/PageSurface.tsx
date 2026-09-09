import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../../lib/utils.ts";

export function PageSurface({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={cn(
        "m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-background sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3",
        className,
      )}
    />
  );
}
export function PageHeader({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-2 sm:px-4 lg:px-5",
        className,
      )}
    >
      {children}
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
