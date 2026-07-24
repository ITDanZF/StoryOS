import { ArrowLeft, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StoryLogo from "../../components/StoryLogo.tsx";

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-[#f7f7f6] sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3" aria-label="关于我们">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
        <button className="grid size-9 shrink-0 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950" type="button" aria-label="返回工作区" onClick={() => navigate("/conversations")}>
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="m-0 text-sm font-semibold tracking-tight text-neutral-900">关于我们</h1>
          <p className="m-0 mt-0.5 text-[10px] text-neutral-400">了解 StoryOS</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
            <StoryLogo className="size-16 rounded-[18px] shadow-lg" />
            <h2 className="mb-0 mt-5 text-xl font-semibold tracking-tight text-neutral-950">StoryOS</h2>
            <p className="mb-0 mt-1 text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">AI Workspace</p>
            <p className="mb-0 mt-5 max-w-md text-sm leading-6 text-neutral-500">面向创作与项目工作的 AI 智能体工作空间，让对话、项目上下文和智能任务保持在同一个工作流中。</p>
          </div>
          <div className="flex items-center gap-3 border-t border-neutral-100 bg-neutral-50/70 px-5 py-4 text-xs sm:px-7">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-neutral-500 shadow-sm"><Info size={16} /></span>
            <span className="text-neutral-500">当前版本</span>
            <strong className="ml-auto font-medium text-neutral-800">1.0.0</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
