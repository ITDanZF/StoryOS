import { ConfirmDialog } from "../../components/ui/Dialog.tsx";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { APP_VERSION } from "../../../shared/appInfo.ts";
import StoryLogo from "../../components/StoryLogo.tsx";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import { ConfigurationPanel } from "./components/ConfigurationPanel.tsx";

import AppearanceSettingsSection from "../../app/theme/AppearanceSettingsSection.tsx";

export default function SettingsPage() {
  const { state, configure } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const location = useLocation();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const required = !state.status?.initialized;
  const blocker = useBlocker(({ nextLocation }) => dirty || saving || (required && nextLocation.pathname !== "/developer"));
  const previousPath = location.state?.returnTo;
  const returnTo = typeof previousPath === "string" && /^\/(conversations|projects|bookshelf)(\/|\?|$)/.test(previousPath) ? previousPath : "/conversations";

  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-subtle" aria-label="设置面板">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-4 sm:px-8">
        <button className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-sm text-text-secondary transition hover:bg-muted focus-visible:outline-2 disabled:opacity-40" type="button" title={required ? "完成模型配置后即可返回" : "返回工作区"} disabled={required || saving} onClick={() => navigate(returnTo)}>
          <ArrowLeft size={17} /><span>返回工作区</span>
        </button>
        <span className="h-4 w-px bg-border" /><span className="text-sm font-medium">设置</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
        <div className="mx-auto grid w-full max-w-[960px] gap-6">
          <div><h1 className="text-2xl font-semibold tracking-tight">偏好设置</h1><p className="mt-2 text-sm text-muted-foreground">管理模型连接，查看应用信息。</p></div>
          <AppearanceSettingsSection />
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="AI 模型">
            {state.status ? <ConfigurationPanel status={state.status} onConfigure={configure} onDirtyChange={setDirty} onSavingChange={setSaving} /> : (
              <div className="flex flex-wrap items-center gap-3 p-7 text-sm text-muted-foreground" role="status">{state.loading ? <><LoaderCircle size={16} className="animate-spin" />正在读取配置…</> : <>配置读取失败。<button className="rounded-lg border border-border px-3 py-2 hover:bg-muted" onClick={() => window.location.reload()}>重新加载</button></>}</div>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-card px-5 py-5 shadow-sm sm:px-7" aria-labelledby="app-info-title">
            <h2 id="app-info-title" className="text-sm font-semibold">应用信息</h2>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3"><StoryLogo className="size-11 rounded-xl border border-border" /><div><p className="text-sm font-semibold">StoryOS</p><p className="mt-1 text-xs text-muted-foreground">AI 创作工作空间</p></div></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">当前版本</p><p className="mt-1 font-mono text-sm font-medium">{APP_VERSION}</p></div>
            </div>
          </section>
          {import.meta.env.DEV && <section className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-5 shadow-sm sm:px-7"><div><h2 className="text-sm font-semibold">开发者工具</h2><p className="mt-2 text-xs text-muted-foreground">浏览本地 SQLite 数据库，管理数据表中的记录。</p></div><button className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted" onClick={() => navigate("/developer")}>打开数据管理</button></section>}
        </div>
      </div>
      {blocker.state === "blocked" && <ConfirmDialog
        title={saving ? "正在保存设置" : required ? "请先完成模型配置" : "有尚未保存的修改"}
        description={saving ? "保存完成后即可离开此页面。" : required ? "配置模型后即可返回工作区开始使用。" : "离开此页面将放弃本次修改，已保存的配置不受影响。"}
        cancelLabel="继续编辑" confirmLabel="放弃修改" onClose={() => blocker.reset()}
        onConfirm={!saving && !required ? () => blocker.proceed() : undefined} />}

    </section>
  );
}
