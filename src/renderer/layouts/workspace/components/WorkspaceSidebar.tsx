import { ChevronDown, Folder, FolderOpen, FolderPlus, LibraryBig, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ConversationScope,
  CreateProjectRequest,
  ProjectDto,
  ProjectNavigationSnapshot,
  ProjectSnapshot,
  RenameProjectRequest,
  ThreadSnapshot,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import StoryLogo from "../../../components/StoryLogo.tsx";
import CreateProjectDialog from "./CreateProjectDialog.tsx";
import ProjectConversationTree from "./ProjectConversationTree.tsx";
import RenameProjectDialog from "./RenameProjectDialog.tsx";
import SettingsLauncher, { type SettingsPage } from "./SettingsLauncher.tsx";

type WorkspaceSidebarProps = {
  readonly open: boolean;
  readonly bookshelfActive: boolean;
  readonly projects: ProjectSnapshot | null;
  readonly activeBookProjectId: string | null;
  readonly conversationScope: ConversationScope;
  readonly globalThreads: ThreadSnapshot | null;
  readonly projectNavigations: Readonly<Record<string, ProjectNavigationSnapshot>>;
  readonly onClose: () => void;
  readonly onOpenBookshelf: () => void;
  readonly onCreateProject: (request: CreateProjectRequest) => Promise<void>;
  readonly onOpenProject: (projectPath: string) => Promise<void>;
  readonly onOpenProjectDirectory: (projectPath: string) => Promise<void>;
  readonly onRenameProject: (request: RenameProjectRequest) => Promise<void>;
  readonly onDeleteProject: (projectPath: string) => Promise<void>;
  readonly onLoadProjectNavigation: (projectId: string) => Promise<void>;
  readonly onOpenBookWorkspace: (project: ProjectDto) => Promise<void>;
  readonly onCreateConversation: (scope: ConversationScope) => Promise<void>;
  readonly onSwitchConversation: (
    scope: ConversationScope,
    threadId: string,
  ) => Promise<void>;
  readonly onDeleteConversation: (
    scope: ConversationScope,
    threadId: string,
  ) => Promise<void>;
  readonly onOpenSettings: (page: SettingsPage) => void;
};

export default function WorkspaceSidebar({
  open,
  bookshelfActive,
  projects,
  activeBookProjectId,
  conversationScope,
  globalThreads,
  projectNavigations,
  onClose,
  onOpenBookshelf,
  onCreateProject,
  onOpenProject,
  onOpenProjectDirectory,
  onRenameProject,
  onDeleteProject,
  onLoadProjectNavigation,
  onOpenBookWorkspace,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onOpenSettings,
}: WorkspaceSidebarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectDto | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeProjectMenu = (event: PointerEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeProjectMenu);
    return () => document.removeEventListener("pointerdown", closeProjectMenu);
  }, [projectMenuOpen]);

  const createProject = async (name: string, parentPath: string) => {
    await onCreateProject({ name, parentPath, createAgentsFile: false });
    setCreateProjectOpen(false);
    onClose();
  };

  const openProject = async () => {
    setProjectMenuOpen(false);
    const projectPath = await window.storyOSWindow.pickDirectory({ title: "选择现有项目文件夹" });
    if (!projectPath) return;
    await onOpenProject(projectPath);
    onClose();
  };

  return (
    <>
      <button className={cn("fixed inset-x-0 bottom-0 top-8 z-30 border-0 bg-black/25 transition-opacity duration-200 lg:hidden", open ? "visible opacity-100" : "invisible opacity-0")} type="button" aria-label="关闭侧栏" onClick={onClose} />
      <aside className={cn(
        "fixed bottom-0 left-0 top-8 z-40 flex w-[min(280px,84vw)] min-w-0 flex-col border-r border-border bg-[#f3f3f2] px-2.5 pb-3 pt-10 shadow-2xl transition-transform duration-200",
        "lg:relative lg:top-0 lg:z-40 lg:w-60 lg:min-w-60 lg:translate-x-0 lg:pt-8 lg:shadow-none 2xl:w-64 2xl:min-w-64",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="absolute inset-x-0 top-0 h-8 [-webkit-app-region:drag]" />
        <div className="flex h-11 shrink-0 items-center gap-2.5 px-2 [-webkit-app-region:drag]">
          <StoryLogo className="size-8 rounded-[10px] shadow-md" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <strong className="text-sm tracking-tight">StoryOS</strong>
            <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">AI Workspace</span>
          </span>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent [-webkit-app-region:no-drag] hover:bg-neutral-200 lg:hidden" type="button" aria-label="关闭侧栏" onClick={onClose}><X size={18} /></button>
        </div>

        <button className="my-3 flex h-9 shrink-0 items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-[13px] font-semibold hover:bg-neutral-200" type="button" onClick={() => void onCreateConversation({ kind: "global" })}>
          <Plus size={17} /><span className="flex-1">新建对话</span><kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-normal text-neutral-400">Ctrl K</kbd>
        </button>

        <button
          className={cn(
            "mb-2 flex h-10 shrink-0 items-center gap-2.5 rounded-xl border-0 px-2.5 text-left text-[13px] font-medium transition",
            bookshelfActive
              ? "bg-white text-neutral-950 shadow-sm"
              : "bg-transparent text-neutral-700 hover:bg-neutral-200/70",
          )}
          type="button"
          aria-current={bookshelfActive ? "page" : undefined}
          onClick={onOpenBookshelf}
        >
          <span className={cn(
            "grid size-7 place-items-center rounded-lg border bg-white shadow-sm",
            bookshelfActive
              ? "border-neutral-300 text-neutral-900"
              : "border-neutral-200 text-neutral-600",
          )}>
            <LibraryBig size={15} />
          </span>
          <span className="flex-1">我的书架</span>
        </button>

        <div className="relative shrink-0" ref={projectMenuRef}>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted-foreground">
            <button className="flex items-center gap-1.5 border-0 bg-transparent p-0 text-[11px] text-muted-foreground hover:text-neutral-700" type="button" aria-expanded={projectsExpanded} onClick={() => { setProjectsExpanded((value) => !value); setProjectMenuOpen(false); }}>
              <Folder size={14} /><span>项目</span><ChevronDown className={cn("transition-transform duration-200 ease-out motion-reduce:transition-none", !projectsExpanded && "-rotate-90")} size={13} />
            </button>
            <button className={cn("grid size-8 place-items-center rounded-xl border bg-transparent text-neutral-500 transition hover:bg-white hover:text-neutral-800", projectMenuOpen ? "border-amber-500 bg-white text-neutral-800 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" : "border-transparent")} type="button" title="项目操作" aria-label="项目操作" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((value) => !value)}><FolderPlus size={17} /></button>
          </div>
          {projectMenuOpen && (
            <div className="absolute left-2 right-2 top-10 z-50 w-auto rounded-xl border border-neutral-200 bg-white p-1 text-neutral-800 shadow-[0_12px_32px_rgba(0,0,0,0.13)] sm:left-auto sm:right-0 sm:w-max sm:min-w-[184px] lg:left-[calc(100%-1.5rem)] lg:right-auto">
              <button className="group flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-xs transition hover:bg-neutral-200" type="button" onClick={() => { setProjectMenuOpen(false); setCreateProjectOpen(true); }}><Plus size={16} className="text-neutral-500 group-hover:text-neutral-800" /><span className="whitespace-nowrap">新建空白项目</span></button>
              <button className="group flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-xs transition hover:bg-neutral-200" type="button" onClick={() => void openProject()}><FolderOpen size={16} className="text-neutral-500 group-hover:text-neutral-800" /><span className="whitespace-nowrap">使用现有文件夹</span></button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {projects && (
            <ProjectConversationTree
              projects={projects}
              projectsExpanded={projectsExpanded}
              activeBookProjectId={activeBookProjectId}
              conversationScope={conversationScope}
              globalThreads={globalThreads}
              projectNavigations={projectNavigations}
              onLoadProjectNavigation={onLoadProjectNavigation}
              onOpenBookWorkspace={async (project) => { await onOpenBookWorkspace(project); onClose(); }}
              onCreateConversation={async (scope) => { await onCreateConversation(scope); onClose(); }}
              onSwitchConversation={async (scope, threadId) => { await onSwitchConversation(scope, threadId); onClose(); }}
              onDeleteConversation={onDeleteConversation}
              onOpenProjectDirectory={onOpenProjectDirectory}
              onRenameProject={setRenameTarget}
              onDeleteProject={onDeleteProject}
            />
          )}
        </div>

        <SettingsLauncher onSelect={onOpenSettings} />
      </aside>
      {createProjectOpen && projects && <CreateProjectDialog defaultParentPath={projects.creationDefaults.parentPath} onClose={() => setCreateProjectOpen(false)} onCreate={createProject} />}
      {renameTarget && <RenameProjectDialog projectName={renameTarget.name} onClose={() => setRenameTarget(null)} onRename={(name) => onRenameProject({ projectPath: renameTarget.path, name })} />}
    </>
  );
}
