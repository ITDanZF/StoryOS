import { Bot, Check, ChevronRight, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AgentConfigurationRequest, AgentServiceStatus } from "../../../../shared/agent/contracts.ts";

type Props = {
  readonly status: AgentServiceStatus | null;
  readonly onConfigure: (request: AgentConfigurationRequest) => Promise<void>;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onSavingChange?: (saving: boolean) => void;
};

const providerDefaults = {
  deepseek: { modelName: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
  openai: { modelName: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1" },
  qwen: { modelName: "qwen-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
} as const;

function initialValues(status: AgentServiceStatus | null): AgentConfigurationRequest {
  const provider = status?.provider === "openai" || status?.provider === "qwen" ? status.provider : "deepseek";
  return { provider, modelName: status?.modelName ?? providerDefaults[provider].modelName, baseUrl: status?.baseUrl ?? providerDefaults[provider].baseUrl, apiKey: "", workspacePath: status?.workspacePath ?? "" };
}

const inputClass = "h-[42px] w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-4 focus:ring-black/5 aria-invalid:border-red-400 disabled:opacity-60";
const secondaryButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";
type FieldErrors = Partial<Record<keyof AgentConfigurationRequest, string>>;

export function ConfigurationPanel({ status, onConfigure, onDirtyChange, onSavingChange }: Props) {
  const [values, setValues] = useState(() => initialValues(status));
  const [baseline, setBaseline] = useState(() => initialValues(status));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = (Object.keys(values) as Array<keyof AgentConfigurationRequest>).some((key) => values[key] !== baseline[key]);
  const canReuseKey = Boolean(status?.configured && values.provider === status.provider && values.baseUrl.trim() === status.baseUrl);

  useEffect(() => {
    const next = initialValues(status);
    setValues(next);
    setBaseline(next);
  }, [status]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);

  const change = (patch: Partial<AgentConfigurationRequest>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
    setFormError(null);
    setSaved(false);
  };
  const reset = () => {
    setValues(baseline);
    setErrors({});
    setFormError(null);
    setSaved(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current || !status) return;
    const nextErrors: FieldErrors = {};
    if (!values.modelName.trim()) nextErrors.modelName = "请填写模型名称。";
    try {
      const url = new URL(values.baseUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      nextErrors.baseUrl = "请输入以 http:// 或 https:// 开头的完整地址。";
    }
    if (!canReuseKey && !values.apiKey.trim()) nextErrors.apiKey = "请填写此模型服务的 API Key。";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const field = Object.keys(nextErrors)[0];
      formRef.current?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      const request = { ...values, modelName: values.modelName.trim(), baseUrl: values.baseUrl.trim(), apiKey: values.apiKey.trim(), workspacePath: values.workspacePath?.trim() };
      await onConfigure(request);
      const next = { ...request, apiKey: "" };
      setValues(next);
      setBaseline(next);
      setSaved(true);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} aria-label="模型设置">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700"><Bot size={21} /></span>
          <div><h2 className="text-base font-semibold tracking-tight">AI 模型</h2><p className="mt-1 text-[13px] text-muted-foreground">用于对话与智能体任务的模型服务</p></div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${status?.restartRequired && !dirty ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>
          <span className="size-1.5 rounded-full bg-current" />{dirty ? "未保存" : status?.restartRequired ? "工作区路径待重启生效" : status?.initialized ? "已配置" : "待配置"}
        </span>
      </div>
      <fieldset disabled={saving || !status} className="min-w-0 space-y-5 px-5 py-6 sm:px-7">
        {status?.restartRequired && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-900" role="status">模型配置已生效。工作区路径将在重启 StoryOS 后生效。</p>}
        <div className="grid gap-2">
          <label htmlFor="model-provider" className="text-sm font-medium">模型服务</label>
          <select id="model-provider" className={inputClass} value={values.provider} onChange={(event) => {
            const provider = event.target.value as AgentConfigurationRequest["provider"];
            change({ provider, ...providerDefaults[provider], apiKey: "" });
          }}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="qwen">通义千问</option></select>
        </div>
        <div className="grid gap-2">
          <label htmlFor="model-name" className="text-sm font-medium">模型名称</label>
          <input id="model-name" name="modelName" className={inputClass} required value={values.modelName} aria-invalid={Boolean(errors.modelName)} aria-describedby="model-name-help" onChange={(event) => change({ modelName: event.target.value })} />
          <p id="model-name-help" className={`text-xs ${errors.modelName ? "text-red-700" : "text-muted-foreground"}`}>{errors.modelName ?? "填写服务商提供的模型 ID，可根据需要更换模型。"}</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="model-url" className="text-sm font-medium">接口地址 <span className="ml-1 font-normal text-muted-foreground">Base URL</span></label>
          <input id="model-url" name="baseUrl" className={inputClass} required type="url" spellCheck={false} value={values.baseUrl} aria-invalid={Boolean(errors.baseUrl)} aria-describedby="model-url-help" onChange={(event) => change({ baseUrl: event.target.value, apiKey: "" })} />
          <p id="model-url-help" className={`text-xs ${errors.baseUrl ? "text-red-700" : "text-muted-foreground"}`}>{errors.baseUrl ?? "支持 OpenAI 兼容接口；更换地址后需重新填写密钥。"}</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="model-key" className="flex items-center justify-between gap-2 text-sm font-medium">API Key {canReuseKey && <span className="text-xs font-normal text-muted-foreground">已保存密钥</span>}</label>
          <input id="model-key" name="apiKey" className={inputClass} required={!canReuseKey} type="password" autoComplete="new-password" spellCheck={false} placeholder={canReuseKey ? "留空保持已保存的密钥" : "输入此服务的 API Key"} value={values.apiKey} aria-invalid={Boolean(errors.apiKey)} aria-describedby="model-key-help" onChange={(event) => change({ apiKey: event.target.value })} />
          <p id="model-key-help" className={`text-xs ${errors.apiKey ? "text-red-700" : "text-muted-foreground"}`}>{errors.apiKey ?? "密钥保存在本机，已保存的密钥不会在页面中显示。"}</p>
        </div>
        <details className="group border-t border-border pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-neutral-600 focus-visible:outline-2 [&::-webkit-details-marker]:hidden"><ChevronRight size={15} className="transition-transform group-open:rotate-90" />高级设置</summary>
          <div className="mt-4 grid gap-2">
            <label htmlFor="workspace-path" className="text-sm font-medium">工作区路径 <span className="ml-1 text-xs font-normal text-muted-foreground">可选</span></label>
            <input id="workspace-path" className={inputClass} value={values.workspacePath} placeholder="留空使用默认工作区路径" onChange={(event) => change({ workspacePath: event.target.value })} aria-describedby="workspace-path-help" />
            <p id="workspace-path-help" className="text-xs text-muted-foreground">修改后重启生效，不会自动搬迁已有项目文件。</p>
          </div>
        </details>
        {formError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
        {saved && !status?.restartRequired && <p role="status" className="flex items-center gap-2 text-[13px] text-neutral-600"><Check size={16} />模型配置已生效，后续任务将使用新配置。</p>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-neutral-50/60 px-5 py-4 sm:px-7">
        <p className="text-xs leading-5 text-muted-foreground">{status?.initialized ? "模型配置保存后立即生效，正在执行的任务不受影响。" : "完成模型配置后即可进入工作区。"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={secondaryButtonClass} type="button" disabled={!dirty || saving} onClick={reset}><RotateCcw size={14} />撤销修改</button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40" disabled={saving || !status || (!dirty && status.initialized)} type="submit">
            {saving && <LoaderCircle size={15} className="animate-spin" />}{saving ? "正在保存…" : status?.initialized ? "保存设置" : "保存并开始使用"}
          </button>
        </div>
      </div>
    </form>
  );
}
