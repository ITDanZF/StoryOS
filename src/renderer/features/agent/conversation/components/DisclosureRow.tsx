import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../../../../../lib/utils.ts";

type DisclosureRowProps = {
  readonly icon: ReactNode;
  readonly label: string;
  readonly summary?: ReactNode;
  readonly running?: boolean;
  readonly failed?: boolean;
  readonly children?: ReactNode;
};

export default function DisclosureRow({
  icon,
  label,
  summary,
  running = false,
  failed = false,
  children,
}: DisclosureRowProps) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(children);

  return (
    <section className="min-w-0 text-xs leading-5">
      <button
        className={cn(
          "group relative flex h-7 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md border-0 bg-transparent px-1 text-left transition-colors",
          expandable ? "cursor-pointer hover:bg-neutral-100/80" : "cursor-default",
          failed ? "text-red-600" : "text-neutral-500",
        )}
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => expandable && setOpen((current) => !current)}
      >
        {running && (
          <span className="pointer-events-none absolute inset-y-0 -left-72 w-72 animate-[conversation-wash_2.6s_ease-out_infinite] bg-gradient-to-r from-transparent via-violet-100/70 to-transparent motion-reduce:hidden" />
        )}
        <span className="relative grid size-4 shrink-0 place-items-center">{icon}</span>
        <strong className={cn("relative shrink-0 font-normal", failed ? "text-red-600" : "text-neutral-600")}>{label}</strong>
        {summary && (
          <>
            <span className="relative size-0.5 shrink-0 rounded-full bg-neutral-300" />
            <span className="relative min-w-0 flex-1 truncate text-neutral-400">{summary}</span>
          </>
        )}
        {expandable && <ChevronDown className={cn("relative ml-auto shrink-0 transition-transform", open && "rotate-180")} size={13} />}
      </button>
      {open && children && (
        <div className="ml-[22px] mt-1 max-h-72 overflow-auto rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-600">
          {children}
        </div>
      )}
    </section>
  );
}
