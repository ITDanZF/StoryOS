import { ChevronDown, Menu, Settings2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import ConfigurationDialog from "./components/ConfigurationDialog.tsx";
import ConversationView from "./components/ConversationView.tsx";
import MessageComposer from "./components/MessageComposer.tsx";
import WorkspaceSidebar from "./components/WorkspaceSidebar.tsx";
import { useAgentWorkspace } from "./useAgentWorkspace.ts";

import WindowTitleBar from '../components/WindowTitleBar.tsx';

export default function AgentWorkspace() {
  const { state, activeRun, configure, createProject, openProject, openProjectDirectory, renameProject, deleteProject, switchProject, createThread, switchThread, deleteThread, sendMessage, cancelRun, clearError } = useAgentWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!state.loading && state.status && !state.status.initialized) setSettingsOpen(true);
  }, [state.loading, state.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void createThread();
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createThread]);

  const activeThread = state.threads?.activeThread;
  const activeProject = state.projects?.activeProject;
  return (
    <main className="mt-8 flex h-[calc(100dvh-32px)] w-full min-w-0 overflow-hidden bg-neutral-100 font-sans text-neutral-900 antialiased [font-synthesis:none] [text-rendering:optimizeLegibility] [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer">
      <WindowTitleBar />
      <WorkspaceSidebar
        open={sidebarOpen}
        status={state.status}
        projects={state.projects}
        threads={state.threads}
        onClose={() => setSidebarOpen(false)}
        onCreateProject={createProject}
        onOpenProject={openProject}
        onOpenProjectDirectory={openProjectDirectory}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onSwitchProject={switchProject}
        onCreateThread={createThread}
        onSwitchThread={switchThread}
        onDeleteThread={deleteThread}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-white sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3">
        <header className="flex min-h-13 items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-2 [-webkit-app-region:drag] sm:min-h-14 sm:px-3 lg:px-5 2xl:min-h-16 2xl:px-7">
          <div className="flex min-w-0 items-center gap-1 [-webkit-app-region:no-drag]">
            <button className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 lg:hidden" type="button" aria-label="打开侧栏" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
            <button className="flex min-w-0 max-w-[52vw] items-center gap-1.5 rounded-lg border-0 bg-transparent px-1.5 py-1.5 text-xs font-semibold sm:text-[13px] lg:max-w-lg" type="button">
              <span className="truncate">{activeProject ? `${activeProject.name} / ` : ""}{activeThread?.title ?? "新对话"}</span><ChevronDown className="shrink-0 text-neutral-400" size={15} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 [-webkit-app-region:no-drag]">
            {activeRun && <span className="hidden h-7 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 text-[10px] text-violet-700 sm:flex"><Sparkles size={14} />AI 正在回复</span>}
            <span className="hidden h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-[10px] text-neutral-500 md:flex"><span className={`size-1.5 rounded-full ${state.status?.initialized ? "bg-emerald-500" : "bg-neutral-400"}`} />{state.status?.initialized ? "已连接" : "未配置"}</span>
            <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100" type="button" title="模型配置" aria-label="模型配置" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <ConversationView messages={state.messages} loading={state.loading} />
          <MessageComposer disabled={!state.status?.initialized || !activeThread} activeRunId={activeRun?.runId} onSend={sendMessage} onCancel={cancelRun} />
        </div>
      </section>

      {state.error && (
        <div className="fixed bottom-4 right-4 z-[70] flex max-w-[min(430px,calc(100vw-32px))] items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 shadow-xl" role="alert">
          <span className="flex-1">{state.error}</span><button className="grid size-7 place-items-center rounded-md border-0 bg-transparent hover:bg-red-100" type="button" onClick={clearError} aria-label="关闭错误提示"><X size={16} /></button>
        </div>
      )}
      {settingsOpen && state.status && <ConfigurationDialog status={state.status} required={!state.status.initialized} onConfigure={configure} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
