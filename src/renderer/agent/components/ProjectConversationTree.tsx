import { ChevronRight, Folder, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ProjectDto, ProjectSnapshot, ThreadSnapshot } from "../../../shared/agent/contracts.ts";
import { cn } from "../../../lib/utils.ts";
import ProjectActionMenu from "./ProjectActionMenu.tsx";

type ProjectConversationTreeProps = {
  readonly projects: ProjectSnapshot;
  readonly threads: ThreadSnapshot | null;
  readonly onSwitchProject: (projectPath: string | null) => Promise<void>;
  readonly onCreateThread: () => Promise<void>;
  readonly onSwitchThread: (threadId: string) => Promise<void>;
  readonly onDeleteThread: (threadId: string) => Promise<void>;
  readonly onOpenProjectDirectory: (projectPath: string) => Promise<void>;
  readonly onRenameProject: (project: ProjectDto) => void;
  readonly onDeleteProject: (projectPath: string) => Promise<void>;
};

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

export default function ProjectConversationTree({
  projects,
  threads,
  onSwitchProject,
  onCreateThread,
  onSwitchThread,
  onDeleteThread,
  onOpenProjectDirectory,
  onRenameProject,
  onDeleteProject,
}: ProjectConversationTreeProps) {
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);
  const activeProjectPath = projects.activeProjectPath;

  const renderThreads = () => (
    <div className="ml-5 grid gap-0.5 border-l border-neutral-200 pl-2">
      <button
        className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-[11px] text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800"
        type="button"
        onClick={() => void onCreateThread()}
      >
        <Plus size={13} />新建对话
      </button>
      {threads?.threads.map((thread) => {
        const active = thread.id === threads.activeThreadId;
        return (
          <div className={cn("group/thread flex min-h-10 items-center rounded-lg py-1 pl-2 pr-1", active ? "bg-neutral-200" : "hover:bg-neutral-200/70")} key={thread.id}>
            <button className="grid min-w-0 flex-1 gap-0.5 border-0 bg-transparent p-0 text-left" type="button" onClick={() => void onSwitchThread(thread.id)}>
              <span className="truncate text-xs text-neutral-700">{thread.title}</span>
              <span className="text-[10px] text-neutral-400">{shortDate(thread.updatedAt)}</span>
            </button>
            <button
              className={cn("grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-red-700", active ? "opacity-100" : "opacity-0 group-hover/thread:opacity-100")}
              type="button"
              title="删除对话"
              aria-label={`删除对话：${thread.title}`}
              onClick={() => { if (window.confirm("确定删除当前对话吗？")) void onDeleteThread(thread.id); }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <nav className="grid min-h-0 content-start gap-1 overflow-y-auto pb-2" aria-label="项目和对话">
      {projects.projects.length ? projects.projects.map((project) => {
        const active = project.path === activeProjectPath;
        return (
          <section className="grid gap-0.5" key={project.id}>
            <div className={cn("group flex h-9 min-w-0 items-center rounded-xl transition", active ? "bg-neutral-200" : "hover:bg-neutral-200/70")}>
              <button
                className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2 text-left text-xs text-neutral-700"
                type="button"
                title={project.path}
                aria-expanded={active}
                onClick={() => void onSwitchProject(project.path)}
              >
                <ChevronRight className={cn("shrink-0 text-neutral-400 transition-transform", active && "rotate-90")} size={13} />
                <Folder className="shrink-0 text-neutral-500" size={15} />
                <span className="truncate">{project.name}</span>
              </button>
              <ProjectActionMenu
                open={activeMenuPath === project.path}
                visible={active}
                projectName={project.name}
                onToggle={() => setActiveMenuPath((current) => current === project.path ? null : project.path)}
                onClose={() => setActiveMenuPath(null)}
                onOpenDirectory={() => onOpenProjectDirectory(project.path)}
                onRename={() => onRenameProject(project)}
                onDelete={async () => {
                  const confirmed = window.confirm(`确定删除项目“${project.name}”吗？\n\n${project.path}\n\n该文件夹及其中的全部文件、对话、日志和 Skill 将被移动到系统回收站。`);
                  if (confirmed) await onDeleteProject(project.path);
                }}
              />
            </div>
            {active && renderThreads()}
          </section>
        );
      }) : <div className="px-2 py-3 text-center text-[11px] text-neutral-400">暂无项目资源</div>}

      <section className="mt-2 grid gap-0.5 border-t border-neutral-200 pt-2">
        <button
          className={cn("flex h-9 w-full items-center gap-2 rounded-xl border-0 px-2 text-left text-xs transition", activeProjectPath === null ? "bg-neutral-200 text-neutral-800" : "bg-transparent text-neutral-600 hover:bg-neutral-200/70")}
          type="button"
          aria-expanded={activeProjectPath === null}
          onClick={() => void onSwitchProject(null)}
        >
          <ChevronRight className={cn("text-neutral-400 transition-transform", activeProjectPath === null && "rotate-90")} size={13} />
          <MessageSquareText className="text-neutral-500" size={15} />
          <span>无项目对话</span>
        </button>
        {activeProjectPath === null && renderThreads()}
      </section>
    </nav>
  );
}