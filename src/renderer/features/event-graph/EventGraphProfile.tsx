import { useEffect, useState } from "react";
import type { OutlineSnapshot } from "../../../shared/contracts/outline/outlineContracts.ts";
import { Button } from "../../components/ui/Button.tsx";
import { Input } from "../../components/ui/Field.tsx";
import type { OutlineProfileInput } from "./useEventGraphSession.ts";

type EventGraphProfileProps = {
  readonly snapshot: OutlineSnapshot | null;
  readonly bookTitle: string;
  readonly busy: boolean;
  readonly onCreate: (input: OutlineProfileInput) => Promise<boolean>;
  readonly onSave: (input: OutlineProfileInput) => Promise<boolean>;
};

function profile(snapshot: OutlineSnapshot | null, bookTitle: string): OutlineProfileInput {
  return snapshot ? {
    title: snapshot.outline.title,
    premise: snapshot.outline.premise,
    theme: snapshot.outline.theme,
    coreConflict: snapshot.outline.coreConflict,
    climaxSummary: snapshot.outline.climaxSummary,
    endingIntent: snapshot.outline.endingIntent,
  } : {
    title: bookTitle,
    premise: "",
    theme: "",
    coreConflict: "",
    climaxSummary: "",
    endingIntent: "",
  };
}

export default function EventGraphProfile({ snapshot, bookTitle, busy, onCreate, onSave }: EventGraphProfileProps) {
  const [input, setInput] = useState<OutlineProfileInput>(() => profile(snapshot, bookTitle));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setInput(profile(snapshot, bookTitle));
  }, [snapshot, bookTitle, dirty]);

  const change = (field: keyof OutlineProfileInput, value: string) => {
    setDirty(true);
    setInput((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    if (input.title.trim() === "" || input.premise.trim() === "") return;
    const saved = snapshot ? await onSave(input) : await onCreate(input);
    if (saved) setDirty(false);
  };

  const content = (
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="grid gap-1 text-xs text-text-secondary">主线标题
        <Input value={input.title} disabled={busy} onChange={(event) => change("title", event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs text-text-secondary">故事构思
        <textarea className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent-border" value={input.premise} disabled={busy} placeholder="主角追求什么，主要阻力是什么？" onChange={(event) => change("premise", event.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionalField label="主题" value={input.theme} disabled={busy} onChange={(value) => change("theme", value)} />
        <OptionalField label="核心冲突" value={input.coreConflict} disabled={busy} onChange={(value) => change("coreConflict", value)} />
        <OptionalField label="高潮意图" value={input.climaxSummary} disabled={busy} onChange={(value) => change("climaxSummary", value)} />
        <OptionalField label="结局意图" value={input.endingIntent} disabled={busy} onChange={(value) => change("endingIntent", value)} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-xs text-text-subtle">主题、高潮和结局可以暂时留空。</p>
        <Button size="sm" type="submit" variant="primary" loading={busy} disabled={busy || !dirty || input.title.trim() === "" || input.premise.trim() === ""}>
          {snapshot ? "保存设定" : "建立全书主线"}
        </Button>
      </div>
    </form>
  );

  if (!snapshot) {
    return <section className="mx-auto grid w-full max-w-2xl gap-4 p-6" aria-label="建立全书主线">
      <div>
        <h1 className="m-0 text-lg font-semibold">从故事构思开始</h1>
        <p className="mt-2 text-sm text-text-secondary">先保存这本书的全书设定，再让 AI 提议一层关键事件。候选经你接受后才会进入正式主线。</p>
      </div>
      {content}
    </section>;
  }

  return <details className="shrink-0 border-b border-border bg-card px-4 py-2">
    <summary className="cursor-pointer text-xs font-semibold">全书设定 · {snapshot.outline.title}</summary>
    <div className="max-w-2xl py-3">{content}</div>
  </details>;
}

function OptionalField({ label, value, disabled, onChange }: { readonly label: string; readonly value: string; readonly disabled: boolean; readonly onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs text-text-secondary">{label}
    <Input value={value} disabled={disabled} placeholder="待定" onChange={(event) => onChange(event.target.value)} />
  </label>;
}
