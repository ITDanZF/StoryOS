import { ChevronDown, Folder, FolderOpen, FolderPlus, MessageSquareText, Plus, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentServiceStatus, CreateProjectRequest, ProjectSnapshot, ThreadSnapshot } from "../../../shared/agent/contracts.ts";
import { cn } from "../../../lib/utils.ts";
import StoryLogo from "./StoryLogo.tsx";

type WorkspaceSidebarProps = {
  readonly open: boolean;
  readonly status: AgentServiceStatus | null;
  readonly projects: ProjectSnapshot | null;
  readonly threads: ThreadSnapshot | null;
  readonly onClose: () => void;
  readonly onCreateProject: (request: CreateProjectRequest) => Promise<void>;
  readonly onOpenProject: (projectPath: string) => Promise<void>;
  readonly onSwitchProject: (projectPath: string | null) => Promise<void>;
  readonly onRemoveProject: (projectPath: string) => Promise<void>;
  readonly onCreateThread: () => Promise<void>;
  readonly onSwitchThread: (threadId: string) => Promise<void>;
  readonly onDeleteThread: (threadId: string) => Promise<void>;
  readonly onOpenSettings: () => void;
};

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function shortPath(value: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.length <= 2 ? value : `…/${parts.slice(-2).join("/")}`;
}

export default function WorkspaceSidebar({
  open,
  status,
  projects,
  threads,
  onClose,
  onCreateProject,
  onOpenProject,
  onSwitchProject,
  onRemoveProject,
  onCreateThread,
  onSwitchThread,
  onDeleteThread,
  onOpenSettings,
}: WorkspaceSidebarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeProjectMenu = (event: PointerEvent) => {
      if (projectMenuRef.current?.contains(event.target as Node)) return;
      setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeProjectMenu);
    return () => document.removeEventListener("pointerdown", closeProjectMenu);
  }, [projectMenuOpen]);

  const createProject = async () => {
    setProjectMenuOpen(false);
    const name = window.prompt("项目名称", "Untitled Project")?.trim();
    if (!name) return;
    await onCreateProject({ name, createAgentsFile: false });
    onClose();
  };

  const openProject = async () => {
    setProjectMenuOpen(false);
    const projectPath = window.prompt("输入已有项目目录的绝对路径")?.trim();
    if (!projectPath) return;
    await onOpenProject(projectPath);
    onClose();
  };

  const switchProject = async (projectPath: string | null) => {
    setProjectMenuOpen(false);
    await onSwitchProject(projectPath);
    onClose();
  };

  const createThread = async () => {
    await onCreateThread();
    onClose();
  };

  const switchThread = async (threadId: string) => {
    await onSwitchThread(threadId);
    onClose();
  };

  const activeProjectPath = projects?.activeProjectPath ?? null;
  const projectLabel = projects?.activeProject?.name ?? "无项目";

  return (
    <>
      <button
        className={cn(
          "fixed inset-0 z-30 border-0 bg-black/25 transition-opacity duration-200 lg:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
        type="button"
        aria-label="关闭侧栏"
        onClick={onClose}
      />
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[min(280px,84vw)] min-w-0 flex-col border-r border-border bg-[#f3f3f2] px-2.5 pb-3 pt-12 shadow-2xl transition-transform duration-200",
        "lg:static lg:z-auto lg:w-60 lg:min-w-60 lg:translate-x-0 lg:shadow-none 2xl:w-64 2xl:min-w-64",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="app-drag absolute inset-x-0 top-0 h-10" />
        <div className="app-drag flex h-11 items-center gap-2.5 px-2">
          <StoryLogo className="size-8 rounded-[10px] shadow-md" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <strong className="text-sm tracking-tight">StoryOS</strong>
            <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">AI Workspace</span>
          </span>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-200 lg:hidden" type="button" aria-label="关闭侧栏" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="my-3 grid gap-1">
          <button className="flex h-9 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-[13px] font-semibold hover:bg-neutral-200" type="button" onClick={() => void createThread()}>
            <Plus size={17} />
            <span className="flex-1">新建对话</span>
            <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-normal text-neutral-400">Ctrl K</kbd>
          </button>
        </div>

        <div className="relative" ref={projectMenuRef}>
          <div className="flex items-center justify-between gap-2 px-2 py-2 text-[11px] text-muted-foreground">
            <button className="flex items-center gap-1.5 border-0 bg-transparent p-0 text-[11px] text-muted-foreground hover:text-neutral-700" type="button" onClick={() => setProjectMenuOpen((value) => !value)}>
              <Folder size={14} />
              <span>项目</span>
              <ChevronDown className={cn("transition-transform", projectMenuOpen && "rotate-180")} size={13} />
            </button>
            <button
              className={cn(
                "grid size-8 place-items-center rounded-xl border bg-transparent text-neutral-500 transition hover:bg-white hover:text-neutral-800",
                projectMenuOpen ? "border-amber-500 bg-white text-neutral-800 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" : "border-transparent",
              )}
              type="button"
              title="项目操作"
              aria-label="项目操作"
              aria-expanded={projectMenuOpen}
              onClick={() => setProjectMenuOpen((value) => !value)}
            >
              <FolderPlus size={17} />
            </button>
          </div>
          {projectMenuOpen && (
            <div className="absolute left-2 right-2 top-11 z-50 rounded-[20px] border border-neutral-100 bg-white p-2 text-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.14)] sm:left-auto sm:right-0 sm:w-[232px] lg:left-[calc(100%-2rem)] lg:right-auto">
              <button className="flex h-11 w-full items-center gap-3 rounded-[14px] border-0 bg-transparent px-3 text-left text-sm hover:bg-neutral-100" type="button" onClick={() => void createProject()}>
                <Plus size={20} className="text-neutral-500" />
                <span className="whitespace-nowrap">新建空白项目</span>
              </button>
              <button className="flex h-11 w-full items-center gap-3 rounded-[14px] border-0 bg-transparent px-3 text-left text-sm hover:bg-neutral-100" type="button" onClick={() => void openProject()}>
                <FolderOpen size={20} className="text-neutral-500" />
                <span className="whitespace-nowrap">使用现有文件夹</span>
              </button>
            </div>
          )}
        </div>
        <nav className="grid max-h-42 gap-0.5 overflow-y-auto pb-2" aria-label="项目">
          <button className={cn("grid min-h-9 rounded-lg border-0 bg-transparent px-2 py-1 text-left hover:bg-neutral-200/70", activeProjectPath === null && "bg-neutral-200")} type="button" onClick={() => void switchProject(null)}>
            <span className="truncate text-xs text-neutral-700">无项目</span>
            <span className="text-[10px] text-neutral-400">未归属对话</span>
          </button>
          {projects?.projects.map((project) => {
            const active = project.path === activeProjectPath;
            return (
              <div className={cn("flex min-h-10 items-center rounded-lg py-1 pl-2 pr-1", active ? "bg-neutral-200" : "hover:bg-neutral-200/70")} key={project.path}>
                <button className="grid min-w-0 flex-1 gap-0.5 border-0 bg-transparent p-0 text-left" type="button" title={project.path} onClick={() => void switchProject(project.path)}>
                  <span className="truncate text-xs text-neutral-700">{project.name}</span>
                  <span className="truncate text-[10px] text-neutral-400">{shortPath(project.path)}</span>
                </button>
                {active && (
                  <button
                    className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-neutral-400 hover:bg-white hover:text-red-700"
                    type="button"
                    title="从列表移除项目"
                    aria-label={`移除项目：${project.name}`}
                    onClick={() => {
                      if (window.confirm("只从 StoryOS 项目列表移除，不删除磁盘目录。确定继续吗？")) void onRemoveProject(project.path);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-muted-foreground">
          <MessageSquareText size={14} />{projectLabel} 对话
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="当前项目对话">
          {threads?.threads.map((thread) => {
            const active = thread.id === threads.activeThreadId;
            return (
              <div className={cn("flex min-h-11 items-center rounded-lg py-1 pl-2 pr-1", active ? "bg-neutral-200" : "hover:bg-neutral-200/70")} key={thread.id}>
                <button className="grid min-w-0 flex-1 gap-0.5 border-0 bg-transparent p-0 text-left" type="button" onClick={() => void switchThread(thread.id)}>
                  <span className="truncate text-xs text-neutral-700">{thread.title}</span>
                  <span className="text-[10px] text-neutral-400">{shortDate(thread.updatedAt)}</span>
                </button>
                {active && (
                  <button
                    className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-neutral-400 hover:bg-white hover:text-red-700"
                    type="button"
                    title="删除对话"
                    aria-label={`删除对话：${thread.title}`}
                    onClick={() => {
                      if (window.confirm("确定删除当前对话吗？")) void onDeleteThread(thread.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        <button className="grid min-h-13 w-full grid-cols-[31px_minmax(0,1fr)_18px] items-center gap-2 border-0 border-t border-neutral-200 bg-transparent px-2 pt-2 text-left hover:bg-neutral-200/60" type="button" onClick={onOpenSettings}>
          <StoryLogo className="size-[30px] rounded-full" />
          <span className="grid min-w-0 gap-0.5">
            <strong className="truncate text-[11px]">{status?.modelName ?? "配置 AI 模型"}</strong>
            <span className={cn("text-[10px]", status?.initialized ? "text-emerald-700" : "text-amber-700")}>
              {status?.initialized ? `${status.provider} · 已连接` : "尚未连接"}
            </span>
          </span>
          <Settings2 size={16} className="text-neutral-400" />
        </button>
      </aside>
    </>
  );
}
