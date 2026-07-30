import {
  BookOpen,
  ChevronRight,
  Folder,
  MessageSquareText,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ConversationScope,
  ProjectDto,
  ProjectNavigationSnapshot,
  ProjectSnapshot,
  ThreadSnapshot,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import AnimatedCollapse from "./AnimatedCollapse.tsx";
import ProjectActionMenu from "./ProjectActionMenu.tsx";

type ProjectConversationTreeProps = {
  readonly projects: ProjectSnapshot;
  readonly projectsExpanded: boolean;
  readonly activeBookProjectId: string | null;
  readonly conversationScope: ConversationScope;
  readonly globalThreads: ThreadSnapshot | null;
  readonly projectNavigations: Readonly<Record<string, ProjectNavigationSnapshot>>;
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
  readonly onOpenProjectDirectory: (projectPath: string) => Promise<void>;
  readonly onRenameProject: (project: ProjectDto) => void;
  readonly onDeleteProject: (projectPath: string) => Promise<void>;
};

export default function ProjectConversationTree({
  projects,
  projectsExpanded,
  activeBookProjectId,
  conversationScope,
  globalThreads,
  projectNavigations,
  onLoadProjectNavigation,
  onOpenBookWorkspace,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onOpenProjectDirectory,
  onRenameProject,
  onDeleteProject,
}: ProjectConversationTreeProps) {
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<
    ReadonlySet<string>
  >(() => new Set(projects.activeProjectId ? [projects.activeProjectId] : []));
  const [globalExpanded, setGlobalExpanded] = useState(true);

  useEffect(() => {
    const activeProjectId = projects.activeProjectId;
    if (!activeProjectId) return;
    setExpandedProjectIds((current) => {
      if (current.has(activeProjectId)) return current;
      return new Set([...current, activeProjectId]);
    });
  }, [projects.activeProjectId]);

  const setProjectExpanded = (projectId: string, expanded: boolean) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  };

  const toggleProject = async (project: ProjectDto) => {
    const expanded = expandedProjectIds.has(project.id);
    setProjectExpanded(project.id, !expanded);
    if (!expanded && !projectNavigations[project.id]) {
      await onLoadProjectNavigation(project.id);
    }
  };

  const renderThreads = (
    scope: ConversationScope,
    snapshot: ThreadSnapshot | null,
  ) => (
    <div className="ml-7 grid gap-0.5 border-l border-neutral-200 pl-2">
      {!snapshot && (
        <div className="px-2 py-2 text-[10px] text-neutral-400">
          正在载入对话…
        </div>
      )}
      {snapshot && snapshot.threads.length === 0 && (
        <div className="px-2 py-2 text-[10px] text-neutral-400">
          暂无对话
        </div>
      )}
      {snapshot?.threads.map((thread) => {
        const active =
          sameConversationScope(scope, conversationScope) &&
          thread.id === snapshot.activeThreadId;
        return (
          <div
            className={cn(
              "group/thread flex min-h-9 items-center rounded-lg py-1 pl-2 pr-1 transition",
              active ? "bg-neutral-200" : "hover:bg-neutral-200/70",
            )}
            key={thread.id}
          >
            <button
              className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-xs text-neutral-700"
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() =>
                void onSwitchConversation(scope, thread.id)}
            >
              {thread.title}
            </button>
            <button
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-red-700 focus-visible:opacity-100 group-hover/thread:opacity-100",
                active ? "opacity-100" : "opacity-0",
              )}
              type="button"
              title="删除对话"
              aria-label={`删除对话：${thread.title}`}
              onClick={() => {
                if (window.confirm("确定删除当前对话吗？")) {
                  void onDeleteConversation(scope, thread.id);
                }
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <nav
      className="grid min-h-0 content-start gap-1 overflow-y-auto pb-2"
      aria-label="项目和对话"
    >
      <AnimatedCollapse open={projectsExpanded}>
        <div className="grid gap-1">
          {projects.projects.length === 0 && (
            <div className="px-2 py-3 text-center text-[11px] text-neutral-400">
              暂无项目
            </div>
          )}
          {projects.projects.map((project) => {
            const expanded = expandedProjectIds.has(project.id);
            const navigation = projectNavigations[project.id] ?? null;
            return (
              <section className="grid gap-0.5" key={project.id}>
                <div
                  className={cn(
                    "group flex h-9 min-w-0 items-center rounded-xl transition hover:bg-neutral-200/70",
                    projects.activeProjectId === project.id && "text-neutral-900",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2 text-left text-xs font-medium text-neutral-700"
                    type="button"
                    title={project.path}
                    aria-expanded={expanded}
                    onClick={() => void toggleProject(project)}
                  >
                    <ChevronRight
                      className={cn(
                        "shrink-0 text-neutral-400 transition-transform duration-200 ease-out motion-reduce:transition-none",
                        expanded && "rotate-90",
                      )}
                      size={13}
                    />
                    <Folder className="shrink-0 text-neutral-500" size={15} />
                    <span className="truncate">{project.name}</span>
                  </button>
                  <ProjectActionMenu
                    open={activeMenuPath === project.path}
                    visible={projects.activeProjectId === project.id}
                    projectName={project.name}
                    onToggle={() =>
                      setActiveMenuPath((current) =>
                        current === project.path ? null : project.path)}
                    onClose={() => setActiveMenuPath(null)}
                    onOpenDirectory={() => onOpenProjectDirectory(project.path)}
                    onRename={() => onRenameProject(project)}
                    onDelete={async () => {
                      const confirmed = window.confirm(
                        `确定删除项目“${project.name}”吗？\n\n${project.path}\n\n该文件夹及其中的全部文件、对话、日志和 Skill 将被移动到系统回收站。`,
                      );
                      if (confirmed) await onDeleteProject(project.path);
                    }}
                  />
                </div>

                <AnimatedCollapse open={expanded}>
                  <div className="grid gap-0.5">
                    <button
                      className={cn(
                        "ml-5 flex h-9 items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-xs text-neutral-600 transition hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300",
                        activeBookProjectId === project.id &&
                          "bg-neutral-200 text-neutral-900",
                      )}
                      type="button"
                      aria-current={
                        activeBookProjectId === project.id ? "page" : undefined
                      }
                      onClick={() => void onOpenBookWorkspace(project)}
                    >
                      <BookOpen size={14} />
                      <span className="min-w-0 flex-1 truncate">书籍工作区</span>
                      {navigation && (
                        <span className="text-[10px] text-neutral-400">
                          {navigation.book
                            ? `${navigation.book.chapterCount}章`
                            : "待命名"}
                        </span>
                      )}
                    </button>
                  </div>
                </AnimatedCollapse>
              </section>
            );
          })}
        </div>
      </AnimatedCollapse>

      <section className="mt-2 grid gap-0.5 border-t border-neutral-200 pt-2">
        <div className="group flex h-9 min-w-0 items-center rounded-lg transition hover:bg-neutral-200/70">
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent px-2 text-left text-[11px] text-muted-foreground hover:text-neutral-700"
            type="button"
            aria-expanded={globalExpanded}
            onClick={() => setGlobalExpanded((value) => !value)}
          >
            <MessageSquareText size={14} />
            <span>对话</span>
            <ChevronRight
              className={cn(
                "text-neutral-400 transition-transform duration-200 ease-out motion-reduce:transition-none",
                globalExpanded && "rotate-90",
              )}
              size={13}
            />
          </button>
          <button
            className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-neutral-800"
            type="button"
            title="新建全局对话"
            aria-label="新建全局对话"
            onClick={() => void onCreateConversation({ kind: "global" })}
          >
            <Plus size={15} />
          </button>
        </div>
        <AnimatedCollapse open={globalExpanded}>
          {renderThreads({ kind: "global" }, globalThreads)}
        </AnimatedCollapse>
      </section>
    </nav>
  );
}

function sameConversationScope(
  left: ConversationScope,
  right: ConversationScope,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "global") return true;
  return right.kind === "project" && left.projectId === right.projectId;
}
