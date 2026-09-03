import { Archive, FileText, FileType2, Files, FileOutput, BookOpen } from "lucide-react";
import type { BookTransferFormatCapability } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";

export const TRANSFER_FORMAT_ICONS = {
  storyos: Archive,
  docx: FileType2,
  markdown: Files,
  text: FileText,
  epub: BookOpen,
  pdf: FileOutput,
} as const;

export const TRANSFER_FORMAT_VISUALS = {
  storyos: {
    shortLabel: "SOS",
    icon: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    badge: "border-indigo-200 bg-indigo-600 text-white",
    card: "hover:border-indigo-300 hover:bg-indigo-50/40",
    selectedCard: "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/15",
    action: "bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-200",
  },
  docx: {
    shortLabel: "W",
    icon: "bg-blue-50 text-blue-700 ring-blue-100",
    badge: "border-blue-200 bg-blue-600 text-white",
    card: "hover:border-blue-300 hover:bg-blue-50/40",
    selectedCard: "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/15",
    action: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-200",
  },
  markdown: {
    shortLabel: "MD",
    icon: "bg-violet-50 text-violet-700 ring-violet-100",
    badge: "border-violet-200 bg-violet-600 text-white",
    card: "hover:border-violet-300 hover:bg-violet-50/40",
    selectedCard: "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-600/15",
    action: "bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-200",
  },
  text: {
    shortLabel: "TXT",
    icon: "bg-amber-50 text-amber-700 ring-amber-100",
    badge: "border-amber-200 bg-amber-500 text-white",
    card: "hover:border-amber-300 hover:bg-amber-50/40",
    selectedCard: "border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/15",
    action: "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-200",
  },
  epub: {
    shortLabel: "EPUB",
    icon: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    badge: "border-emerald-200 bg-emerald-600 text-white",
    card: "hover:border-emerald-300 hover:bg-emerald-50/40",
    selectedCard: "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/15",
    action: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-200",
  },
  pdf: {
    shortLabel: "PDF",
    icon: "bg-red-50 text-red-700 ring-red-100",
    badge: "border-red-200 bg-red-600 text-white",
    card: "hover:border-red-300 hover:bg-red-50/40",
    selectedCard: "border-red-600 bg-red-600 text-white shadow-lg shadow-red-600/15",
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {formats.map((format) => {
        const Icon = TRANSFER_FORMAT_ICONS[format.id];
        const visual = TRANSFER_FORMAT_VISUALS[format.id];
        const enabled = direction === "import" ? format.canImport : format.canExport;
        const isSelected = selected === format.id;

        return <button className={cn(
          "group relative flex min-h-40 flex-col rounded-2xl border p-5 text-left transition duration-200",
          isSelected ? visual.selectedCard : cn("border-neutral-200 bg-white hover:-translate-y-0.5 hover:shadow-md", visual.card),
          !enabled && "cursor-not-allowed opacity-45 hover:translate-y-0 hover:border-neutral-200 hover:bg-white hover:shadow-none",
        )} type="button" disabled={!enabled} onClick={() => onSelect(format)} key={format.id}>
          <span className={cn("relative grid size-11 place-items-center rounded-xl ring-1 transition", isSelected ? "bg-white/15 text-white ring-white/15" : visual.icon)}>
            <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
            <span className={cn("absolute -bottom-1.5 -right-1.5 grid min-h-4 min-w-4 place-items-center rounded-md border px-1 text-[7px] font-extrabold leading-3 tracking-[-0.02em] shadow-sm", isSelected ? "border-white/30 bg-white text-current" : visual.badge)}>{visual.shortLabel}</span>
          </span>
          <strong className="mt-4 text-sm font-semibold leading-5">{format.label}</strong>
          <span className={cn("mt-1 text-[10px] font-medium tracking-wide", isSelected ? "text-white/70" : "text-neutral-400")}>{format.extensions.map((item) => `.${item}`).join(" · ")}</span>
          <p className={cn("mb-0 mt-2.5 text-[11px] leading-[1.65]", isSelected ? "text-white/80" : "text-neutral-600")}>{format.description}</p>
          {!enabled && <span className="absolute right-3 top-3 rounded-full bg-neutral-100 px-2.5 py-1 text-[9px] font-semibold text-neutral-500">暂不支持</span>}
        </button>;
      })}
    </div>
  );
}
