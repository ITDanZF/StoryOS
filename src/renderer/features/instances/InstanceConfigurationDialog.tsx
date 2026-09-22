import { FolderOpen, Settings2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  ALIYUN_EMBEDDING_DIMENSIONS,
  ALIYUN_TEXT_EMBEDDING_MODEL,
  DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS,
  type AgentConfigurationInput,
  type AliyunEmbeddingDimensions,
} from "../../../shared/contracts/settings/contracts.ts";
import type { InstanceConfigurationDto, StoryInstanceDto } from "../../../shared/contracts/instances/contracts.ts";
import AnimatedDialog from "../../components/motion/AnimatedDialog.tsx";
import { Button } from "../../components/ui/Button.tsx";
import EmbeddingConfigurationFields from "../model-configuration/EmbeddingConfigurationFields.tsx";
import { FormField, Input } from "../../components/ui/Field.tsx";
import Select from "../../components/ui/Select.tsx";

type Draft = {
  name: string;
  rootPath: string;
  provider: "openai" | "deepseek" | "qwen";
  modelName: string;
  baseUrl: string;
  apiKey: string;
  chatKeyConfigured: boolean;
  embeddingBaseUrl: string;
  embeddingKey: string;
  embeddingKeyConfigured: boolean;
  dimensions: string;
  defaultProjectsRoot: string;
  logLevel: string;
};

const providers = [
  { value: "deepseek", label: "DeepSeek" },
] as const;

const deepseekModels = [
  { value: "deepseek-flash", label: "DeepSeek Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
] as const;

export function createInstanceDraft(rootPath: string): Draft {
  return {
    name: "",
    rootPath,
    provider: "deepseek",
    modelName: "deepseek-flash",
    baseUrl: "",
    apiKey: "",
    chatKeyConfigured: false,
    embeddingBaseUrl: "",
    embeddingKey: "",
    embeddingKeyConfigured: false,
    dimensions: String(DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS),
    defaultProjectsRoot: "",
    logLevel: "info",
  };
}

export function editInstanceDraft(instance: StoryInstanceDto, configuration: InstanceConfigurationDto): Draft {
  return {
    name: instance.name,
    rootPath: instance.rootPath,
    provider: configuration.chat.provider,
    modelName: configuration.chat.modelName,
    baseUrl: configuration.chat.baseUrl,
    apiKey: "",
    chatKeyConfigured: configuration.chat.apiKeyConfigured,
    embeddingBaseUrl: configuration.embedding.enabled ? configuration.embedding.baseUrl : "",
    embeddingKey: "",
    embeddingKeyConfigured: configuration.embedding.enabled && configuration.embedding.apiKeyConfigured,
    dimensions: configuration.embedding.enabled
      ? String(configuration.embedding.dimensions)
      : String(DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS),
    defaultProjectsRoot: configuration.workspace.defaultProjectsRoot,
    logLevel: configuration.logLevel,
  };
}

function requireHttpUrl(value: string, label: string): string {
  const normalized = value.trim();
  let url: URL;
  try { url = new URL(normalized); } catch { throw new Error(`${label}必须是完整 URL。`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label}必须使用 HTTP 或 HTTPS。`);
  return normalized;
}

function makeConfiguration(draft: Draft, editing: boolean): AgentConfigurationInput {
  if (!draft.modelName.trim()) throw new Error("请填写对话模型名称。");
  if (!editing && !draft.apiKey.trim()) throw new Error("请填写对话模型 API Key。");
  const baseUrl = requireHttpUrl(draft.baseUrl, "对话模型 URL");
  const embeddingBaseUrl = requireHttpUrl(draft.embeddingBaseUrl, "文本向量 Base URL");
  if ((!editing || !draft.embeddingKeyConfigured) && !draft.embeddingKey.trim())
    throw new Error("请填写 Embedding API Key。");
  const dimensions = Number(draft.dimensions);
  if (!(ALIYUN_EMBEDDING_DIMENSIONS as readonly number[]).includes(dimensions))
    throw new Error("请选择支持的向量维度。");
  return {
    schemaVersion: 2,
    chat: {
      provider: draft.provider,
      modelName: draft.modelName.trim(),
      baseUrl,
      apiKey: draft.apiKey.trim(),
    },
    embedding: {
      enabled: true,
      modelName: ALIYUN_TEXT_EMBEDDING_MODEL,
      apiKey: draft.embeddingKey.trim(),
      baseUrl: embeddingBaseUrl,
      dimensions: dimensions as AliyunEmbeddingDimensions,
    },
    workspace: { defaultProjectsRoot: draft.defaultProjectsRoot.trim() },
    logLevel: draft.logLevel,
  };
}

type Props = {
  readonly instance: StoryInstanceDto | null;
  readonly initialDraft: Draft;
  readonly onClose: () => void;
  readonly onCreate: (name: string, rootPath: string, configuration: AgentConfigurationInput) => Promise<void>;
  readonly onUpdate: (instance: StoryInstanceDto, name: string, configuration: AgentConfigurationInput) => Promise<void>;
};

export default function InstanceConfigurationDialog({ instance, initialDraft, onClose, onCreate, onUpdate }: Props) {
  const editing = instance !== null;
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };

  const submit = async (event: FormEvent<HTMLFormElement>, close: (afterClose?: unknown) => void) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const name = draft.name.trim();
      const rootPath = draft.rootPath.trim();
      if (!name || !rootPath) throw new Error("请填写实例名称和存储路径。");
      const configuration = makeConfiguration(draft, editing);
      if (instance) await onUpdate(instance, name, configuration);
      else await onCreate(name, rootPath, configuration);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <AnimatedDialog busy={saving} onClose={onClose} aria-labelledby="instance-config-title" className="max-w-[720px] rounded-2xl border border-border bg-card shadow-2xl">
      {({ close }) => <form onSubmit={(event) => void submit(event, close)}>
        <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-text-secondary"><Settings2 size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="instance-config-title" className="m-0 text-sm font-semibold">{editing ? "修改实例配置" : "新建实例"}</h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-muted-foreground">{editing ? "已保存内容已回显；密钥留空可保留原值。" : "创建一个独立的数据与 AI 配置空间。"}</p>
          </div>
          <button className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" type="button" aria-label="关闭" onClick={close} disabled={saving}><X size={16} /></button>
        </header>

        <div className="grid gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2 sm:px-6">
          <FormField label="实例名称">{control => <Input {...control} required disabled={saving} value={draft.name} onChange={(event) => change({ name: event.target.value })} />}</FormField>
          <FormField label="存储路径" description={editing ? "实例创建后不可在配置编辑中迁移目录。" : undefined}>{control => <div className="flex gap-2"><Input {...control} required disabled={editing || saving} value={draft.rootPath} onChange={(event) => change({ rootPath: event.target.value })} /><Button size="icon" type="button" disabled={editing || saving} title="选择目录" onClick={() => void window.storyOSWindow.pickDirectory({ title: "选择实例目录" }).then((selected) => { if (selected) change({ rootPath: selected }); })}><FolderOpen size={16} /></Button></div>}</FormField>

          <h3 className="col-span-full border-t border-border pt-4 text-xs font-semibold text-text-secondary">对话模型</h3>
          <FormField label="服务商">{control => <Select {...control} label="服务商" size="md" disabled={saving} options={providers} value={draft.provider} onChange={(value) => change({ provider: value as Draft["provider"], apiKey: "", chatKeyConfigured: false })} />}</FormField>
          <FormField label="模型">{control => <Select {...control} label="模型" size="md" disabled={saving} options={deepseekModels} value={draft.modelName} onChange={(value) => change({ modelName: value })} />}</FormField>
          <FormField label="Base URL">{control => <Input {...control} required disabled={saving} type="url" value={draft.baseUrl} onChange={(event) => change({ baseUrl: event.target.value, apiKey: "", chatKeyConfigured: false })} />}</FormField>
          <FormField label={editing && draft.chatKeyConfigured ? "API Key（已保存）" : "API Key"} description={editing && draft.chatKeyConfigured ? "留空保持原密钥；更换服务商或地址后需重新填写。" : undefined}>{control => <Input {...control} required={!editing || !draft.chatKeyConfigured} disabled={saving} type="password" autoComplete="new-password" placeholder={editing && draft.chatKeyConfigured ? "留空保持原密钥" : "输入 API Key"} value={draft.apiKey} onChange={(event) => change({ apiKey: event.target.value })} />}</FormField>

          <EmbeddingConfigurationFields
            baseUrl={draft.embeddingBaseUrl}
            apiKey={draft.embeddingKey}
            apiKeyLabel={editing && draft.embeddingKeyConfigured ? "API Key（已保存）" : "API Key"}
            apiKeyPlaceholder={editing && draft.embeddingKeyConfigured ? "留空保持原密钥" : "输入 API Key"}
            apiKeyDescription={editing && draft.embeddingKeyConfigured ? "留空保持原密钥。更换地址后需重新填写。" : undefined}
            apiKeyRequired={!editing || !draft.embeddingKeyConfigured}
            dimensions={draft.dimensions}
            disabled={saving}
            onBaseUrlChange={(value) => change({ embeddingBaseUrl: value, embeddingKey: "", embeddingKeyConfigured: false })}
            onApiKeyChange={(value) => change({ embeddingKey: value })}
            onDimensionsChange={(value) => change({ dimensions: value })}
          />
        </div>

        {error && <p role="alert" className="mx-5 mb-3 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger-text sm:mx-6">{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
          <Button type="button" disabled={saving} onClick={close}>取消</Button>
          <Button variant="primary" type="submit" loading={saving}>{editing ? "保存并生效" : "创建并进入"}</Button>
        </footer>
      </form>}
    </AnimatedDialog>
  );
}
