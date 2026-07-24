import { ArrowLeft, Bot } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import { ConfigurationPanel } from "./components/ConfigurationDialog.tsx";

export default function SettingsPage() {
  const { state, configure } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const status = state.status;
  const required = Boolean(status && !status.initialized);
  const returnToConversation = () => navigate("/conversations");

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-[#f7f7f6] sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3" aria-label="设置面板">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
        <button
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          aria-label="返回工作区"
          title={required ? "完成模型配置后即可返回" : "返回"}
          disabled={required}
          onClick={returnToConversation}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="m-0 text-sm font-semibold tracking-tight text-neutral-900">设置面板</h1>
          <p className="m-0 mt-0.5 text-[10px] text-neutral-400">管理 StoryOS 的模型连接</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-neutral-900 text-white shadow-sm"><Bot size={20} /></span>
            <div>
              <h2 className="m-0 text-lg font-semibold tracking-tight text-neutral-900">AI 模型</h2>
              <p className="m-0 mt-1 text-xs text-neutral-500">配置用于 StoryOS 对话与智能体任务的模型服务。</p>
            </div>
          </div>
          {status && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,0.04)] sm:p-7">
              <ConfigurationPanel status={status} onConfigure={configure} onConfigured={returnToConversation} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
