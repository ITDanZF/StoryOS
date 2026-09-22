import { useId, useRef, type KeyboardEvent } from "react";
import { ALIYUN_EMBEDDING_DIMENSIONS } from "../../../shared/contracts/settings/contracts.ts";
import { FormField, Input } from "../../components/ui/Field.tsx";
import { cn } from "../../../lib/utils.ts";

type Props = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly apiKeyLabel: string;
  readonly apiKeyPlaceholder: string;
  readonly apiKeyDescription?: string;
  readonly apiKeyRequired?: boolean;
  readonly dimensions: string;
  readonly disabled?: boolean;
  readonly baseUrlError?: string;
  readonly apiKeyError?: string;
  readonly baseUrlName?: string;
  readonly apiKeyName?: string;
  readonly onBaseUrlChange: (value: string) => void;
  readonly onApiKeyChange: (value: string) => void;
  readonly onDimensionsChange: (value: string) => void;
};

export default function EmbeddingConfigurationFields({
  baseUrl,
  apiKey,
  apiKeyLabel,
  apiKeyPlaceholder,
  apiKeyDescription,
  apiKeyRequired = false,
  dimensions,
  disabled = false,
  baseUrlError,
  apiKeyError,
  baseUrlName,
  apiKeyName,
  onBaseUrlChange,
  onApiKeyChange,
  onDimensionsChange,
}: Props) {
  return (
    <section className="col-span-full grid gap-4 rounded-xl border border-border bg-surface-subtle p-4">
      <div>
        <h3 className="text-xs font-semibold text-text-secondary">文本向量</h3>
        <p className="mb-0 mt-1 text-xs leading-5 text-muted-foreground">
          阿里云 text-embedding-v4。地址和密钥按控制台整段粘贴。
        </p>
      </div>
      <FormField
        label="Base URL"
        error={baseUrlError}
        description="末尾一般是 /compatible-mode/v1。"
      >
        {(control) => (
          <Input
            {...control}
            name={baseUrlName}
            required
            disabled={disabled}
            type="url"
            spellCheck={false}
            placeholder="https://….maas.aliyuncs.com/compatible-mode/v1"
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
        )}
      </FormField>
      <FormField label={apiKeyLabel} error={apiKeyError} description={apiKeyDescription}>
        {(control) => (
          <Input
            {...control}
            name={apiKeyName}
            required={apiKeyRequired}
            disabled={disabled}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder={apiKeyPlaceholder}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
        )}
      </FormField>
      <EmbeddingDimensionPicker
        value={dimensions}
        disabled={disabled}
        onChange={onDimensionsChange}
      />
    </section>
  );
}

function EmbeddingDimensionPicker({
  value,
  disabled,
  onChange,
}: {
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const labelId = useId();
  const helpId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    ALIYUN_EMBEDDING_DIMENSIONS.findIndex((item) => String(item) === value),
  );
  const choose = (index: number) => {
    const next = ALIYUN_EMBEDDING_DIMENSIONS[index];
    if (next === undefined) return;
    onChange(String(next));
    buttons.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const last = ALIYUN_EMBEDDING_DIMENSIONS.length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      choose(selectedIndex === last ? 0 : selectedIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      choose(selectedIndex === 0 ? last : selectedIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      choose(0);
    } else if (event.key === "End") {
      event.preventDefault();
      choose(last);
    }
  };

  return (
    <div className="grid gap-1.5">
      <span id={labelId} className="text-xs font-medium text-foreground">
        向量维度
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={helpId}
        className="grid grid-cols-4 gap-2"
        onKeyDown={onKeyDown}
      >
      {ALIYUN_EMBEDDING_DIMENSIONS.map((item, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={item}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn(
              "h-9 rounded-lg border text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
              selected
                ? "border-accent-border bg-accent font-medium text-accent-foreground"
                : "border-input bg-background text-foreground hover:bg-muted",
            )}
            onClick={() => onChange(String(item))}
          >
            {item}
          </button>
        );
      })}
      </div>
      <p id={helpId} className="text-xs leading-5 text-muted-foreground">
        常用 1024。
      </p>
    </div>
  );
}
