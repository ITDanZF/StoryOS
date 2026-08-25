import { LibraryBig, Menu } from "lucide-react";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";

export default function BookshelfPage() {
  const { openSidebar } = useWorkspaceOutlet();

  return (
    <section
      className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-[#f7f7f6] sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3"
      aria-label="我的书架"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white/90 px-2 backdrop-blur-xl sm:px-4 lg:px-6">
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 lg:hidden"
          type="button"
          aria-label="打开侧栏"
          onClick={openSidebar}
        >
          <Menu size={19} />
        </button>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-900 text-white">
          <LibraryBig size={16} />
        </span>
        <h1 className="m-0 text-sm font-semibold tracking-tight text-neutral-900">
          我的书架
        </h1>
      </header>

      <div className="min-h-0 flex-1" aria-label="书架内容" />
    </section>
  );
}
