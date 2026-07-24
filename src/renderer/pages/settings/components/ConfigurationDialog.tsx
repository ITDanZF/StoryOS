import { Bot, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentConfigurationRequest, AgentServiceStatus } from "../../../../shared/agent/contracts.ts";

type ConfigurationDialogProps = {
  readonly status: AgentServiceStatus | null;
  readonly required: boolean;
  readonly onClose: () => void;
  readonly onConfigure: (request: AgentConfigurationRequest) => Promise<void>;
};

type ConfigurationPanelProps = {
  readonly status: AgentServiceStatus | null;
  readonly onConfigure: (request: AgentConfigurationRequest) => Promise<void>;
  readonly onConfigured?: () => void;
};

const providerDefaults = {
  deepseek: { modelName: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
  openai: { modelName: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1" },
  qwen: { modelName: "qwen-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
} as const;

const inputClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-xs text-neutral-800 outline-none transition focus:border-neutral-500 focus:ring-4 focus:ring-black/5";

export function ConfigurationPanel({ status, onConfigure, onConfigured }: ConfigurationPanelProps) {
  const [provider, setProvider] = useState<AgentConfigurationRequest["provider"]>("deepseek");
  const [modelName, setModelName] = useState<string>(providerDefaults.deepseek.modelName);
  const [baseUrl, setBaseUrl] = useState<string>(providerDefaults.deepseek.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!status?.initialized) return;
    if (status.provider === "deepseek" || status.provider === "openai" || status.provider === "qwen") setProvider(status.provider);
    if (status.modelName) setModelName(status.modelName);
    if (status.baseUrl) setBaseUrl(status.baseUrl);
    if (status.workspacePath) setWorkspacePath(status.workspacePath);
  }, [status]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status?.initialized) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onConfigure({ provider, modelName, baseUrl, apiKey, workspacePath });
      onConfigured?.();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex-1">
        <h2 className="m-0 text-base font-semibold tracking-tight" id="config-title">{status?.initialized ? "模型连接" : "连接你的 AI"}</h2>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{status?.initialized ? "当前模型配置已生效，重新配置需要重启 StoryOS。" : "配置一个 OpenAI 兼容模型以开始对话。"}</p>
      </div>

      {status?.initialized ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-700">
          <CheckCircle2 size={20} />
          <div className="grid min-w-0 gap-1"><strong className="text-xs text-emerald-900">{status.modelName}</strong><span className="break-all text-[10px]">{status.provider} · {status.baseUrl}</span></div>
        </div>
      ) : (
        <form className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1.5 text-[10px] font-semibold text-neutral-600">
            <span>模型服务</span>
            <select className={inputClass} value={provider} onChange={(event) => {
              const next = event.target.value as AgentConfigurationRequest["provider"];
              setProvider(next);
              setModelName(providerDefaults[next].modelName);
              setBaseUrl(providerDefaults[next].baseUrl);
            }}>
              <option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="qwen">通义千问</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-[10px] font-semibold text-neutral-600 sm:col-span-2"><span>模型名称</span><input className={inputClass} required value={modelName} onChange={(event) => setModelName(event.target.value)} /></label>
          <label className="grid gap-1.5 text-[10px] font-semibold text-neutral-600 sm:col-span-2"><span>Base URL</span><input className={inputClass} required type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
          <label className="grid gap-1.5 text-[10px] font-semibold text-neutral-600 sm:col-span-2"><span>API Key</span><input className={inputClass} required type="password" placeholder="sk-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label>
          <label className="grid gap-1.5 text-[10px] font-semibold text-neutral-600 sm:col-span-2"><span className="flex justify-between">工作区路径 <small className="font-normal text-neutral-400">可选</small></span><input className={inputClass} placeholder="E:\\workspace\\my-story" value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} /></label>
          {formError && <div className="rounded-lg bg-red-50 p-2.5 text-[10px] text-red-700 sm:col-span-2">{formError}</div>}
          <button className="h-9 rounded-lg border border-neutral-900 bg-neutral-900 px-4 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2" disabled={submitting} type="submit">{submitting ? "正在连接…" : "保存并连接"}</button>
        </form>
      )}
    </>
  );
}

export default function ConfigurationDialog({ status, required, onClose, onConfigure }: ConfigurationDialogProps) {
  return (
    <div className="fixed inset-0 z-50 grid items-end bg-black/25 p-0 backdrop-blur-[3px] sm:place-items-center sm:p-6" role="presentation">
      <section className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[18px] border border-border bg-white p-5 shadow-2xl sm:w-[min(500px,100%)] sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="config-title">
        <span className="mb-3 grid size-10 place-items-center rounded-xl bg-neutral-900 text-white"><Bot size={21} /></span>
        {!required && <button className="absolute right-5 top-5 grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100" type="button" aria-label="关闭" onClick={onClose}><X size={17} /></button>}
        <ConfigurationPanel status={status} onConfigure={onConfigure} onConfigured={onClose} />
      </section>
    </div>
  );
}
