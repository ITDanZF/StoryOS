import { Grid2X2, List, Search } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "../../../../lib/utils.ts";

export type BookshelfView = "grid" | "list";

type BookshelfToolbarProps = {
  readonly query: string;
  readonly view: BookshelfView;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  readonly onQueryChange: (query: string) => void;
  readonly onViewChange: (view: BookshelfView) => void;
};

export default function BookshelfToolbar({
  query,
  view,
  searchInputRef,
  onQueryChange,
  onViewChange,
}: BookshelfToolbarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 shadow-sm transition focus-within:border-neutral-400 focus-within:ring-4 focus-within:ring-black/5 md:w-[270px]">
        <Search className="shrink-0 text-neutral-400" size={14} />
        <input ref={searchInputRef} className="min-w-0 flex-1 border-0 bg-transparent text-[10px] text-neutral-700 outline-none placeholder:text-neutral-400" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索书名或简介" aria-label="搜索书籍" />
        <kbd className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[7px] text-neutral-400">Ctrl F</kbd>
      </label>

      <div className="ml-auto hidden items-center rounded-xl border border-neutral-200 bg-neutral-200/70 p-1 sm:flex" role="group" aria-label="切换展示方式">
        <button className={cn("grid size-7 place-items-center rounded-lg border-0 bg-transparent text-neutral-400", view === "grid" && "bg-white text-neutral-700 shadow-sm")} type="button" aria-label="网格视图" aria-pressed={view === "grid"} onClick={() => onViewChange("grid")}><Grid2X2 size={14} /></button>
        <button className={cn("grid size-7 place-items-center rounded-lg border-0 bg-transparent text-neutral-400", view === "list" && "bg-white text-neutral-700 shadow-sm")} type="button" aria-label="列表视图" aria-pressed={view === "list"} onClick={() => onViewChange("list")}><List size={14} /></button>
      </div>
    </div>
  );
}
