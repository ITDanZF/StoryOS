import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import WindowTitleBar from "../../components/WindowTitleBar.tsx";
import "../../features/agent/api/previewAgentApi.ts";
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
    createThread,
    switchThread,
    deleteThread,
    clearError,
  } = workspace;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const openConversation = useCallback(async () => {
    const thread = await createThread();
    navigate(`/conversations/${thread.id}`);
  }, [createThread, navigate]);

  useEffect(() => {
    if (!state.loading && state.status && !state.status.initialized && location.pathname !== "/settings") {
      navigate("/settings", { replace: true });
    }
  }, [location.pathname, navigate, state.loading, state.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void openConversation();
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openConversation]);

  return (
    <main className="mt-8 flex h-[calc(100dvh-32px)] w-full min-w-0 overflow-hidden bg-neutral-100 font-sans text-neutral-900 antialiased [font-synthesis:none] [text-rendering:optimizeLegibility] [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer">
      <WindowTitleBar />
      <WorkspaceSidebar
        open={sidebarOpen}
        projects={state.projects}
        threads={state.threads}
        onClose={() => setSidebarOpen(false)}
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
        onSwitchProject={async (projectPath) => {
          await switchProject(projectPath);
          navigate("/conversations");
        }}
        onCreateThread={async () => {
          await openConversation();
          setSidebarOpen(false);
        }}
        onSwitchThread={async (threadId) => {
          await switchThread(threadId);
          navigate(`/conversations/${threadId}`);
          setSidebarOpen(false);
        }}
        onDeleteThread={async (threadId) => {
          const snapshot = await deleteThread(threadId);
          navigate(`/conversations/${snapshot.activeThreadId}`);
        }}
        onOpenSettings={(page) => {
          setSidebarOpen(false);
          navigate(page === "settings" ? "/settings" : "/about");
        }}
      />

      <Outlet context={{ ...workspace, openSidebar: () => setSidebarOpen(true) }} />

      {state.error && (
        <div className="fixed bottom-4 right-4 z-[70] flex max-w-[min(430px,calc(100vw-32px))] items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 shadow-xl" role="alert">
          <span className="flex-1">{state.error}</span>
          <button className="grid size-7 place-items-center rounded-md border-0 bg-transparent hover:bg-red-100" type="button" onClick={clearError} aria-label="关闭错误提示">
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
