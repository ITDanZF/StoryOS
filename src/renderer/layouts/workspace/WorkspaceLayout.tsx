import { Toast } from "../../components/ui/Notice.tsx";
import { hasOpenDialog, isEditableTarget } from "../../lib/keyboard.ts";
import ReaderEntryLayer from "../../features/reader/ReaderEntryLayer.tsx";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { ConversationScope } from "../../../shared/agent/contracts.ts";
import WindowTitleBar from "../../components/WindowTitleBar.tsx";
import { AnimatedPage } from "../../components/motion/index.ts";
import { useAgentWorkspace } from "../../features/agent/hooks/useAgentWorkspace.ts";
import WorkspaceSidebar from "./components/WorkspaceSidebar.tsx";

export default function WorkspaceLayout() {
  const workspace = useAgentWorkspace();
  const {
    state,
    createProject,
    openProject,
    openProjectDirectory,
    renameProject,
    deleteProject,
    switchProject,
    loadProjectNavigation,
    createThread,
    switchThread,
    deleteThread,
    clearError,
  } = workspace;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const reading = /^\/bookshelf\/[^/]+\/read$/.test(location.pathname);

  const openConversation = useCallback(async (
    scope: ConversationScope = { kind: "global" },
  ) => {
    const thread = await createThread(scope);
    if (scope.kind === "global") {
      navigate(`/conversations/${thread.id}`);
    } else {
      navigate(
        `/projects/${scope.projectId}/book?conversation=${thread.id}`,
      );
    }
  }, [createThread, navigate]);

  useEffect(() => {
    if (!state.loading && state.status && !state.status.initialized && location.pathname !== "/settings") {
      navigate("/settings", { replace: true });
    }
  }, [location.pathname, navigate, state.loading, state.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || hasOpenDialog() || isEditableTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (location.pathname === "/settings") return;
        void openConversation();
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openConversation, location.pathname]);

  return (
    <main className="flex h-dvh w-full min-w-0 overflow-hidden bg-muted pt-8 font-sans text-foreground antialiased [font-synthesis:none] [text-rendering:optimizeLegibility] [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer">
      <WindowTitleBar /><ReaderEntryLayer />
      {location.pathname !== "/settings" && !reading && <WorkspaceSidebar
        open={sidebarOpen}
        bookshelfActive={location.pathname.startsWith("/bookshelf")}
        projects={state.projects}
        activeBookProjectId={
          location.pathname.match(/^\/projects\/([^/]+)\/book$/)?.[1] ?? null
        }
        conversationScope={state.conversationScope}
        globalThreads={state.globalThreads}
        projectNavigations={state.projectNavigations}
        onClose={() => setSidebarOpen(false)}
        onOpenBookshelf={() => {
          setSidebarOpen(false);
          navigate("/bookshelf");
        }}
        onCreateProject={async (request) => {
          await createProject(request);
          navigate("/conversations");
        }}
        onOpenProject={async (projectPath) => {
          await openProject(projectPath);
          navigate("/conversations");
        }}
        onOpenProjectDirectory={openProjectDirectory}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onLoadProjectNavigation={async (projectId) => {
          await loadProjectNavigation(projectId);
        }}
        onOpenBookWorkspace={async (project) => {
          if (state.projects?.activeProjectId !== project.id) {
            await switchProject(project.path);
          }
          navigate(`/projects/${project.id}/book`);
        }}
        onCreateConversation={async (scope) => {
          await openConversation(scope);
          setSidebarOpen(false);
        }}
        onSwitchConversation={async (scope, threadId) => {
          await switchThread(threadId, scope);
          navigate(scope.kind === "global"
            ? `/conversations/${threadId}`
            : `/projects/${scope.projectId}/book?conversation=${threadId}`);
          setSidebarOpen(false);
        }}
        onDeleteConversation={async (scope, threadId) => {
          const snapshot = await deleteThread(threadId, scope);
          if (scope.kind === "project") {
            navigate(snapshot.activeThreadId
              ? `/projects/${scope.projectId}/book?conversation=${snapshot.activeThreadId}`
              : `/projects/${scope.projectId}/book`);
          } else {
            navigate(snapshot.activeThreadId
              ? `/conversations/${snapshot.activeThreadId}`
              : "/conversations");
          }
        }}
        onOpenSettings={(page) => {
          setSidebarOpen(false);
          navigate(page === "settings" ? "/settings" : "/about", {
            state: { returnTo: `${location.pathname}${location.search}` },
          });
        }}
        onSwitchInstance={() => {
          setSidebarOpen(false);
          navigate("/instances");
        }}
      />}

      <AnimatedPage transitionKey={location.pathname} disabled={reading}>
        <Outlet context={{ ...workspace, openSidebar: () => setSidebarOpen(true) }} />
      </AnimatedPage>

      {state.error && <Toast tone="danger" onDismiss={clearError}>{state.error}</Toast>}

    </main>
  );
}
