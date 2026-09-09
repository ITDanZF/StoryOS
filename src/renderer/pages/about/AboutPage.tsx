import { ArrowLeft, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StoryLogo from "../../components/StoryLogo.tsx";
import { APP_VERSION } from "../../../shared/appInfo.ts";

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-surface-subtle sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3" aria-label="关于我们">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-xl sm:px-6">
        <button className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-text-secondary shadow-sm transition hover:border-border-strong hover:bg-surface-subtle hover:text-foreground" type="button" aria-label="返回工作区" onClick={() => navigate("/conversations")}>
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="m-0 text-sm font-semibold tracking-tight text-foreground">关于我们</h1>
          <p className="m-0 mt-0.5 text-[10px] text-text-subtle">了解 StoryOS</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
            <StoryLogo className="size-16 rounded-[18px] shadow-lg" />
            <h2 className="mb-0 mt-5 text-xl font-semibold tracking-tight text-foreground">StoryOS</h2>
            <p className="mb-0 mt-1 text-xs font-medium uppercase tracking-[0.14em] text-text-subtle">AI Workspace</p>
            <p className="mb-0 mt-5 max-w-md text-sm leading-6 text-muted-foreground">面向创作与项目工作的 AI 智能体工作空间，让对话、项目上下文和智能任务保持在同一个工作流中。</p>
          </div>
          <div className="flex items-center gap-3 border-t border-border bg-surface-subtle/70 px-5 py-4 text-xs sm:px-7">
            <span className="grid size-8 place-items-center rounded-lg bg-card text-muted-foreground shadow-sm"><Info size={16} /></span>
            <span className="text-muted-foreground">当前版本</span>
            <strong className="ml-auto font-medium text-foreground">{APP_VERSION}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
