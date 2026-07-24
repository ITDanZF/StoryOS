import type { ReactNode } from "react";
import { cn } from "../../../lib/utils.ts";

type AnimatedCollapseProps = {
  readonly open: boolean;
  readonly children: ReactNode;
  readonly className?: string;
};

export default function AnimatedCollapse({
  open,
  children,
  className,
}: AnimatedCollapseProps) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
        className,
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
