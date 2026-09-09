import { Archive, FileText, FileType2, Files, FileOutput, BookOpen } from "lucide-react";
import type { BookTransferFormatCapability } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import "../../../components/motion/motion.css";

export const TRANSFER_FORMAT_ICONS = {
  storyos: Archive,
  docx: FileType2,
  markdown: Files,
  text: FileText,
  epub: BookOpen,
  pdf: FileOutput,
} as const;

// Saturated format identity colors stay paired with inverse text, independent of UI mode.
export const TRANSFER_FORMAT_VISUALS = {
  storyos: {
    shortLabel: "SOS",
    icon: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    badge: "border-indigo-200 bg-indigo-600 text-inverse",
    card: "hover:border-indigo-300 hover:bg-indigo-50/40",
    selectedCard: "border-indigo-600 bg-indigo-600 text-inverse shadow-lg shadow-indigo-600/15",
    action: "bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-200",
  },
  docx: {
    shortLabel: "W",
    icon: "bg-blue-50 text-blue-700 ring-blue-100",
    badge: "border-blue-200 bg-blue-600 text-inverse",
    card: "hover:border-blue-300 hover:bg-blue-50/40",
    selectedCard: "border-blue-600 bg-blue-600 text-inverse shadow-lg shadow-blue-600/15",
    action: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-200",
  },
  markdown: {
    shortLabel: "MD",
    icon: "bg-accent text-accent-foreground ring-accent-border",
    badge: "border-violet-200 bg-violet-600 text-inverse",
    card: "hover:border-accent-border hover:bg-accent/40",
    selectedCard: "border-violet-600 bg-violet-600 text-inverse shadow-lg shadow-violet-600/15",
    action: "bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-200",
  },
  text: {
    shortLabel: "TXT",
    icon: "bg-warning-surface text-warning-text ring-warning-border",
    badge: "border-amber-200 bg-amber-700 text-inverse",
    card: "hover:border-warning-border hover:bg-warning-surface/40",
    selectedCard: "border-amber-700 bg-amber-700 text-inverse shadow-lg shadow-amber-700/15",
    action: "bg-amber-700 hover:bg-amber-800 focus-visible:ring-amber-200",
  },
  epub: {
    shortLabel: "EPUB",
    icon: "bg-success-surface text-success-text ring-success-border",
    badge: "border-emerald-200 bg-emerald-600 text-inverse",
    card: "hover:border-success-border hover:bg-success-surface/40",
    selectedCard: "border-emerald-600 bg-emerald-600 text-inverse shadow-lg shadow-emerald-600/15",
    action: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-200",
  },
  pdf: {
    shortLabel: "PDF",
    icon: "bg-danger-surface text-danger-text ring-danger-border",
    badge: "border-red-200 bg-red-600 text-inverse",
    card: "hover:border-danger-border hover:bg-danger-surface/40",
    selectedCard: "border-red-600 bg-red-600 text-inverse shadow-lg shadow-red-600/15",
    action: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-200",
  },
} as const;

export default function TransferFormatGrid({
  formats,
  direction,
  selected,
  onSelect,
}: {
  readonly formats: readonly BookTransferFormatCapability[];
  readonly direction: "import" | "export";
  readonly selected: string | null;
  readonly onSelect: (format: BookTransferFormatCapability) => void;
}) {
  return (
    <div className="transfer-format-grid motion-stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {formats.map((format) => {
        const Icon = TRANSFER_FORMAT_ICONS[format.id];
        const visual = TRANSFER_FORMAT_VISUALS[format.id];
        const enabled = direction === "import" ? format.canImport : format.canExport;
        const isSelected = selected === format.id;

        return <button className={cn(
          "group relative flex min-h-40 flex-col rounded-2xl border p-5 text-left transition duration-200",
          isSelected ? visual.selectedCard : cn("border-border bg-card hover:-translate-y-0.5 hover:shadow-md", visual.card),
          !enabled && "cursor-not-allowed opacity-45 hover:translate-y-0 hover:border-border hover:bg-card hover:shadow-none",
        )} type="button" disabled={!enabled} onClick={() => onSelect(format)} key={format.id}>
          <span className={cn("relative grid size-11 place-items-center rounded-xl ring-1 transition", isSelected ? "bg-card/15 text-inverse ring-white/15" : visual.icon)}>
            <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
            <span className={cn("absolute -bottom-1.5 -right-1.5 grid min-h-4 min-w-4 place-items-center rounded-md border px-1 text-[7px] font-extrabold leading-3 tracking-[-0.02em] shadow-sm", isSelected ? "border-border/30 bg-card text-foreground" : visual.badge)}>{visual.shortLabel}</span>
          </span>
          <strong className="mt-4 text-sm font-semibold leading-5">{format.label}</strong>
          <span className={cn("mt-1 text-[10px] font-medium tracking-wide", isSelected ? "text-inverse/70" : "text-text-subtle")}>{format.extensions.map((item) => `.${item}`).join(" · ")}</span>
          <p className={cn("mb-0 mt-2.5 text-[11px] leading-[1.65]", isSelected ? "text-inverse/80" : "text-text-secondary")}>{format.description}</p>
          {!enabled && <span className="absolute right-3 top-3 rounded-full bg-muted px-2.5 py-1 text-[9px] font-semibold text-muted-foreground">暂不支持</span>}
        </button>;
      })}
    </div>
  );
}
