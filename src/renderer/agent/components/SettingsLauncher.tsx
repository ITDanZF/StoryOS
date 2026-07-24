import { ChevronRight, Info, Settings2, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type SettingsPage = "settings" | "about";

type SettingsLauncherProps = {
  readonly onSelect: (page: SettingsPage) => void;
};

export default function SettingsLauncher({ onSelect }: SettingsLauncherProps) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      if (!launcherRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const select = (page: SettingsPage) => {
    setOpen(false);
    onSelect(page);
  };

  return (
    <div className="relative shrink-0 border-t border-neutral-200 pt-2" ref={launcherRef}>
      <div
        className={`absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 origin-bottom rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-[0_16px_45px_rgba(0,0,0,0.16)] transition duration-150 ${
          open ? "visible translate-y-0 scale-100 opacity-100" : "invisible translate-y-1 scale-[0.98] opacity-0"
        }`}
        role="menu"
        aria-hidden={!open}
      >
        <button className="group flex h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-2.5 text-left text-xs text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950" type="button" role="menuitem" tabIndex={open ? 0 : -1} onClick={() => select("settings")}>
          <SlidersHorizontal className="text-neutral-500 group-hover:text-neutral-800" size={16} />
          <span className="flex-1">设置面板</span>
          <ChevronRight className="text-neutral-300 group-hover:text-neutral-500" size={15} />
        </button>
        <button className="group flex h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-2.5 text-left text-xs text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950" type="button" role="menuitem" tabIndex={open ? 0 : -1} onClick={() => select("about")}>
          <Info className="text-neutral-500 group-hover:text-neutral-800" size={16} />
          <span className="flex-1">关于我们</span>
          <ChevronRight className="text-neutral-300 group-hover:text-neutral-500" size={15} />
        </button>
      </div>

      <button
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border-0 px-2.5 text-left text-[13px] font-medium transition ${
          open ? "bg-white text-neutral-950 shadow-sm" : "bg-transparent text-neutral-700 hover:bg-neutral-200/70"
        }`}
        type="button"
        aria-label="打开设置菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="grid size-7 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-sm">
          <Settings2 size={15} />
        </span>
        <span className="flex-1">设置</span>
        <ChevronRight className={`text-neutral-400 transition-transform duration-150 ${open ? "-rotate-90" : ""}`} size={15} />
      </button>
    </div>
  );
}
