import { Button } from "../../../components/ui/Button.tsx";
import { FormField, Input } from "../../../components/ui/Field.tsx";
import Select from "../../../components/ui/Select.tsx";
import { InlineNotice } from "../../../components/ui/Notice.tsx";
import { Bot, Check, ChevronRight, RotateCcw } from "lucide-react";
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
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-text-secondary"><Bot size={21} /></span>
          <div><h2 className="text-base font-semibold tracking-tight">AI 模型</h2><p className="mt-1 text-[13px] text-muted-foreground">用于对话与智能体任务的模型服务</p></div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${status?.restartRequired && !dirty ? "bg-warning-surface text-warning-text" : "bg-muted text-muted-foreground"}`}>
          <span className="size-1.5 rounded-full bg-current" />{dirty ? "未保存" : status?.restartRequired ? "工作区路径待重启生效" : status?.initialized ? "已配置" : "待配置"}
        </span>
      </div>
      <fieldset disabled={saving || !status} className="min-w-0 space-y-5 px-5 py-6 sm:px-7">
        {status?.restartRequired && <p className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3 text-[13px] leading-6 text-warning-text" role="status">模型配置已生效。工作区路径将在重启 StoryOS 后生效。</p>}
        <FormField id="model-provider" label="模型服务">{control => <Select {...control} label="模型服务" size="md" disabled={saving || !status} options={[{ value: "deepseek", label: "DeepSeek" }, { value: "openai", label: "OpenAI" }, { value: "qwen", label: "通义千问" }]} value={values.provider} onChange={value => {
          const provider = value as AgentConfigurationRequest["provider"];
          change({ provider, ...providerDefaults[provider], apiKey: "" });
        }} />}</FormField>
        <FormField id="model-name" label="模型名称" error={errors.modelName} description="填写服务商提供的模型 ID，可根据需要更换模型。">{control => <Input {...control} name="modelName" required value={values.modelName} onChange={event => change({ modelName: event.target.value })} />}</FormField>
        <FormField id="model-url" label="接口地址 Base URL" error={errors.baseUrl} description="支持 OpenAI 兼容接口；更换地址后需重新填写密钥。">{control => <Input {...control} name="baseUrl" required type="url" spellCheck={false} value={values.baseUrl} onChange={event => change({ baseUrl: event.target.value, apiKey: "" })} />}</FormField>
        <FormField id="model-key" label={canReuseKey ? "API Key（已保存密钥）" : "API Key"} error={errors.apiKey} description="密钥保存在本机，已保存的密钥不会在页面中显示。">{control => <Input {...control} name="apiKey" required={!canReuseKey} type="password" autoComplete="new-password" spellCheck={false} placeholder={canReuseKey ? "留空保持已保存的密钥" : "输入此服务的 API Key"} value={values.apiKey} onChange={event => change({ apiKey: event.target.value })} />}</FormField>
        <details className="group border-t border-border pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-text-secondary focus-visible:outline-2 [&::-webkit-details-marker]:hidden"><ChevronRight size={15} className="transition-transform group-open:rotate-90" />高级设置</summary>
          <div className="mt-4 grid gap-2">
            <label htmlFor="workspace-path" className="text-sm font-medium">工作区路径 <span className="ml-1 text-xs font-normal text-muted-foreground">可选</span></label>
            <Input id="workspace-path" value={values.workspacePath} placeholder="留空使用默认工作区路径" onChange={(event) => change({ workspacePath: event.target.value })} aria-describedby="workspace-path-help" />
            <p id="workspace-path-help" className="text-xs text-muted-foreground">修改后重启生效，不会自动搬迁已有项目文件。</p>
          </div>
        </details>
        {formError && <InlineNotice tone="danger">{formError}</InlineNotice>}
        {saved && !status?.restartRequired && <p role="status" className="flex items-center gap-2 text-[13px] text-text-secondary"><Check size={16} />模型配置已生效，后续任务将使用新配置。</p>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-surface-subtle/60 px-5 py-4 sm:px-7">
        <p className="text-xs leading-5 text-muted-foreground">{status?.initialized ? "模型配置保存后立即生效，正在执行的任务不受影响。" : "完成模型配置后即可进入工作区。"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!dirty || saving} onClick={reset}><RotateCcw size={14} />撤销修改</Button>
          <Button variant="primary" loading={saving} disabled={saving || !status || (!dirty && status.initialized)} type="submit">
            {saving ? "正在保存…" : status?.initialized ? "保存设置" : "保存并开始使用"}
          </Button>
        </div>
      </div>
    </form>
  );
}
