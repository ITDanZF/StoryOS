import { ChevronDown, Menu, Settings2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import ConversationView from "./components/ConversationView.tsx";
import MessageComposer from "./components/MessageComposer.tsx";

export default function ConversationPage() {
  const { state, activeRun, switchThread, sendMessage, cancelRun, openSidebar } = useWorkspaceOutlet();
  const { threadId } = useParams();
  const navigate = useNavigate();
  const activeThread = state.threads?.activeThread;
  const activeProject = state.projects?.activeProject;

  useEffect(() => {
    if (!state.threads) return;
    if (!threadId) {
      if (state.threads.activeThreadId) {
        navigate(`/conversations/${state.threads.activeThreadId}`, { replace: true });
      }
      return;
    }
    if (threadId === state.threads.activeThreadId) return;
    if (!state.threads.threads.some((thread) => thread.id === threadId)) {
      navigate(
        state.threads.activeThreadId
          ? `/conversations/${state.threads.activeThreadId}`
          : "/conversations",
        { replace: true },
      );
      return;
    }
    void switchThread(threadId);
  }, [navigate, state.threads, switchThread, threadId]);

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-white sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3">
      <header className="flex min-h-13 items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-2 [-webkit-app-region:drag] sm:min-h-14 sm:px-3 lg:px-5 2xl:min-h-16 2xl:px-7">
        <div className="flex min-w-0 items-center gap-1 [-webkit-app-region:no-drag]">
          <button className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 lg:hidden" type="button" aria-label="打开侧栏" onClick={openSidebar}>
            <Menu size={19} />
          </button>
          <button className="flex min-w-0 max-w-[52vw] items-center gap-1.5 rounded-lg border-0 bg-transparent px-1.5 py-1.5 text-xs font-semibold sm:text-[13px] lg:max-w-lg" type="button">
            <span className="truncate">{activeProject ? `${activeProject.name} / ` : ""}{activeThread?.title ?? "新对话"}</span>
            <ChevronDown className="shrink-0 text-neutral-400" size={15} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 [-webkit-app-region:no-drag]">
          {activeRun && <span className="hidden h-7 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 text-[10px] text-violet-700 sm:flex"><Sparkles size={14} />AI 正在回复</span>}
          <span className="hidden h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-[10px] text-neutral-500 md:flex">
            <span className={`size-1.5 rounded-full ${state.status?.initialized ? "bg-emerald-500" : "bg-neutral-400"}`} />
            {state.status?.initialized ? "已连接" : "未配置"}
          </span>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100" type="button" title="模型配置" aria-label="模型配置" onClick={() => navigate("/settings")}>
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ConversationView messages={state.messages} loading={state.loading} />
        <MessageComposer
          disabled={!state.status?.initialized || !activeThread}
          activeRunId={activeRun?.runId}
          projectName={activeProject?.name}
          onSend={sendMessage}
          onCancel={cancelRun}
        />
      </div>
    </section>
  );
}
