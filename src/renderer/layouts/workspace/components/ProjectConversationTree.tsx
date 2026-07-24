import {
  ChevronRight,
  Folder,
  MessageSquareText,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ProjectDto,
  ProjectSnapshot,
  ThreadSnapshot,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import AnimatedCollapse from "./AnimatedCollapse.tsx";
import ProjectActionMenu from "./ProjectActionMenu.tsx";

type ProjectConversationTreeProps = {
  readonly projects: ProjectSnapshot;
  readonly projectsExpanded: boolean;
  readonly threads: ThreadSnapshot | null;
  readonly onSwitchProject: (projectPath: string | null) => Promise<void>;
  readonly onCreateThread: () => Promise<void>;
  readonly onSwitchThread: (threadId: string) => Promise<void>;
  readonly onDeleteThread: (threadId: string) => Promise<void>;
  readonly onOpenProjectDirectory: (projectPath: string) => Promise<void>;
  readonly onRenameProject: (project: ProjectDto) => void;
  readonly onDeleteProject: (projectPath: string) => Promise<void>;
};

const UNSCOPED_WORKSPACE_KEY = "\0unscoped";

function workspaceKey(projectPath: string | null): string {
  return projectPath ?? UNSCOPED_WORKSPACE_KEY;
}

export default function ProjectConversationTree({
  projects,
  projectsExpanded,
  threads,
  onSwitchProject,
  onCreateThread,
  onSwitchThread,
  onDeleteThread,
  onOpenProjectDirectory,
  onRenameProject,
  onDeleteProject,
}: ProjectConversationTreeProps) {
  const activeProjectPath = projects.activeProjectPath;
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);
  const [expandedProjectPaths, setExpandedProjectPaths] = useState<
    ReadonlySet<string>
  >(() => new Set(activeProjectPath ? [activeProjectPath] : []));
  const [conversationsExpanded, setConversationsExpanded] = useState(
    activeProjectPath === null,
  );
  const [threadSnapshots, setThreadSnapshots] = useState<
    ReadonlyMap<string, ThreadSnapshot>
  >(() => new Map());

  useEffect(() => {
    if (!threads) return;
    const key = workspaceKey(activeProjectPath);
    setThreadSnapshots((current) => {
      if (current.get(key) === threads) return current;
      const next = new Map(current);
      next.set(key, threads);
      return next;
    });
  }, [activeProjectPath, threads]);

  const setProjectExpanded = (projectPath: string, expanded: boolean) => {
    setExpandedProjectPaths((current) => {
      const next = new Set(current);
      if (expanded) next.add(projectPath);
      else next.delete(projectPath);
      return next;
    });
  };

  const switchWorkspace = async (projectPath: string | null) => {
    if (activeProjectPath !== projectPath) {
      await onSwitchProject(projectPath);
    }
  };

  const toggleProject = async (projectPath: string) => {
    const expanded = expandedProjectPaths.has(projectPath);
    setProjectExpanded(projectPath, !expanded);
    if (!expanded) await switchWorkspace(projectPath);
  };

  const toggleUnscopedConversations = async () => {
    if (conversationsExpanded) {
      setConversationsExpanded(false);
      return;
    }
    setConversationsExpanded(true);
    await switchWorkspace(null);
  };

  const createThreadFor = async (projectPath: string | null) => {
    if (projectPath === null) setConversationsExpanded(true);
    else setProjectExpanded(projectPath, true);
    await switchWorkspace(projectPath);
    await onCreateThread();
  };

  const switchThreadFor = async (
    projectPath: string | null,
    threadId: string,
  ) => {
    await switchWorkspace(projectPath);
    await onSwitchThread(threadId);
  };

  const deleteThreadFor = async (
    projectPath: string | null,
    threadId: string,
  ) => {
    await switchWorkspace(projectPath);
    await onDeleteThread(threadId);
  };

  const snapshotFor = (projectPath: string | null): ThreadSnapshot | null =>
    activeProjectPath === projectPath
      ? threads
      : threadSnapshots.get(workspaceKey(projectPath)) ?? null;

  const renderThreads = (
    snapshot: ThreadSnapshot | null,
    projectPath: string | null,
  ) => (
    <div className="ml-5 grid gap-0.5 border-l border-neutral-200 pl-2">
      {!snapshot && (
        <div className="px-2 py-2 text-[10px] text-neutral-400">
          正在载入对话…
        </div>
      )}
      {snapshot?.threads.map((thread) => {
        const active =
          projectPath === activeProjectPath &&
          thread.id === snapshot.activeThreadId;
        return (
          <div
            className={cn(
              "group/thread flex min-h-10 items-center rounded-lg py-1 pl-2 pr-1 transition",
              active ? "bg-neutral-200" : "hover:bg-neutral-200/70",
            )}
            key={thread.id}
          >
            <button
              className="grid min-w-0 flex-1 gap-0.5 border-0 bg-transparent p-0 text-left"
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() =>
                void switchThreadFor(projectPath, thread.id)}
            >
              <span className="truncate text-xs text-neutral-700">
                {thread.title}
              </span>
            </button>
            <button
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-red-700 focus:opacity-100 group-hover/thread:opacity-100",
                active ? "opacity-100" : "opacity-0",
              )}
              type="button"
              title="删除对话"
              aria-label={`删除对话：${thread.title}`}
              onClick={() => {
                if (window.confirm("确定删除当前对话吗？")) {
                  void deleteThreadFor(projectPath, thread.id);
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
          {projects.projects.length
          ? projects.projects.map((project) => {
              const expanded = expandedProjectPaths.has(project.path);
              return (
                <section className="grid gap-0.5" key={project.id}>
                  <div className="group flex h-9 min-w-0 items-center rounded-xl transition hover:bg-neutral-200/70">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2 text-left text-xs text-neutral-700"
                      type="button"
                      title={project.path}
                      aria-expanded={expanded}
                      onClick={() => void toggleProject(project.path)}
                    >
                      <ChevronRight
                        className={cn(
                          "shrink-0 text-neutral-400 transition-transform duration-200 ease-out motion-reduce:transition-none",
                          expanded && "rotate-90",
                        )}
                        size={13}
                      />
                      <Folder
                        className="shrink-0 text-neutral-500"
                        size={15}
                      />
                      <span className="truncate">{project.name}</span>
                    </button>
                    <button
                      className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 opacity-0 transition hover:bg-white hover:text-neutral-800 focus-visible:bg-white focus-visible:text-neutral-800 focus-visible:opacity-100 group-hover:opacity-100"
                      type="button"
                      title={`在 ${project.name} 中新建对话`}
                      aria-label={`在 ${project.name} 中新建对话`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void createThreadFor(project.path);
                      }}
                    >
                      <Plus size={15} />
                    </button>
                    <ProjectActionMenu
                      open={activeMenuPath === project.path}
                      visible={false}
                      projectName={project.name}
                      onToggle={() =>
                        setActiveMenuPath((current) =>
                          current === project.path ? null : project.path)}
                      onClose={() => setActiveMenuPath(null)}
                      onOpenDirectory={() =>
                        onOpenProjectDirectory(project.path)}
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
                    {renderThreads(
                      snapshotFor(project.path),
                      project.path,
                    )}
                  </AnimatedCollapse>
                </section>
              );
            })
          : (
              <div className="px-2 py-3 text-center text-[11px] text-neutral-400">
                暂无项目资源
              </div>
            )}
        </div>
      </AnimatedCollapse>

      <section className="mt-2 grid gap-0.5 border-t border-neutral-200 pt-2">
        <div className="group flex h-9 min-w-0 items-center rounded-lg transition hover:bg-neutral-200/70">
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent px-2 text-left text-[11px] text-muted-foreground hover:text-neutral-700"
            type="button"
            aria-expanded={conversationsExpanded}
            onClick={() => void toggleUnscopedConversations()}
          >
            <MessageSquareText size={14} />
            <span>对话</span>
            <ChevronRight
              className={cn(
                "text-neutral-400 transition-transform duration-200 ease-out motion-reduce:transition-none",
                conversationsExpanded && "rotate-90",
              )}
              size={13}
            />
          </button>
          <button
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-white hover:text-neutral-800 focus:opacity-100",
              activeProjectPath === null
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100",
            )}
            type="button"
            title="新建无归属对话"
            aria-label="新建无归属对话"
            onClick={(event) => {
              event.stopPropagation();
              void createThreadFor(null);
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <AnimatedCollapse open={conversationsExpanded}>
          {renderThreads(snapshotFor(null), null)}
        </AnimatedCollapse>
      </section>
    </nav>
  );
}
