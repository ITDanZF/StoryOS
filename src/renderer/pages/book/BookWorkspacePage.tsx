import { BookOpen, Menu } from "lucide-react";
import { useParams } from "react-router-dom";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";

export default function BookWorkspacePage() {
  const { projectId } = useParams();
  const { state, openSidebar } = useWorkspaceOutlet();
  const project = state.projects?.projects.find(
    (item) => item.id === projectId,
  );
  const navigation = projectId
    ? state.projectNavigations[projectId] ?? null
    : null;

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-white sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3">
      <header className="flex min-h-13 items-center gap-2 border-b border-neutral-100 px-2 sm:min-h-14 sm:px-3 lg:px-5">
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 lg:hidden"
          type="button"
          aria-label="打开侧栏"
          onClick={openSidebar}
        >
          <Menu size={19} />
        </button>
        <span className="truncate text-[13px] font-semibold">
          {project?.name ?? "项目"} / 书籍工作区
        </span>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
        <div>
          <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-neutral-100 text-neutral-600">
            <BookOpen size={21} />
          </span>
          <h1 className="m-0 text-lg font-semibold">
            {navigation?.book.title ?? "书籍工作区"}
          </h1>
          <p className="mt-2 text-xs text-neutral-400">
            页面结构将在下一阶段继续设计
          </p>
        </div>
      </div>
    </section>
  );
}
