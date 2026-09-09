import { useRef, useState } from "react";
import type { CreateBookshelfBookRequest } from "../../../../shared/agent/contracts.ts";
import { AnimatedDialog } from "../../../components/motion/index.ts";
import { Button } from "../../../components/ui/Button.tsx";
import { DialogFooter, DialogHeader } from "../../../components/ui/Dialog.tsx";
import { FormField, Input, Textarea } from "../../../components/ui/Field.tsx";
import { InlineNotice } from "../../../components/ui/Notice.tsx";
import { getErrorMessage } from "../../../lib/error.ts";

export default function NewBookDialog({ busy, onClose, onCreate }: {
  busy: boolean; onClose: () => void;
  onCreate: (input: CreateBookshelfBookRequest) => Promise<void | (() => void)>;
}) {
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  return <AnimatedDialog aria-labelledby="new-book-title" busy={busy} onClose={onClose} className="max-w-[460px] rounded-2xl border border-border bg-card shadow-2xl">
    {({ close }) => <form onSubmit={async event => {
      event.preventDefault();
      if (!title.trim() || busy || submitting.current) return;
      submitting.current = true; setError(null);
      try { const next = await onCreate({ title: title.trim(), synopsis: synopsis.trim() }); close(next); }
      catch (cause) { setError(getErrorMessage(cause)); }
      finally { submitting.current = false; }
    }}>
      <DialogHeader id="new-book-title" title="新建书籍" description="先创建独立书籍资产，随后可以为它建立写作项目。" onClose={close} busy={busy} />
      <div className="grid gap-4 p-5">
        <FormField label="书籍名称">{control => <Input {...control} autoFocus maxLength={200} placeholder="例如：未寄出的冬天" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} />}</FormField>
        <FormField label="故事简介" description="可选，写下这个故事最重要的一句话。">{control => <Textarea {...control} maxLength={20_000} value={synopsis} onChange={event => setSynopsis(event.target.value)} disabled={busy} />}</FormField>
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      </div>
      <DialogFooter><Button size="sm" disabled={busy} onClick={close}>取消</Button><Button size="sm" variant="primary" type="submit" loading={busy} disabled={!title.trim()}>{busy ? "正在创建…" : "创建书籍"}</Button></DialogFooter>
    </form>}
  </AnimatedDialog>;
}
