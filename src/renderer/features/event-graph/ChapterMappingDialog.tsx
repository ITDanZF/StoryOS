import { useState } from "react";
import type { ChapterOutlineMapping } from "../../../shared/contracts/outline/outlineContracts.ts";
import { AnimatedDialog } from "../../components/motion/index.ts";
import { Button } from "../../components/ui/Button.tsx";
import { DialogFooter, DialogHeader } from "../../components/ui/Dialog.tsx";
import { Input, NativeSelect } from "../../components/ui/Field.tsx";
import type { ChapterOption } from "./model/document.ts";

type Props = {
  readonly nodeTitle: string;
  readonly chapters: readonly ChapterOption[];
  readonly mappings: readonly ChapterOutlineMapping[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (chapterId: string, segmentIntent: string, expectedLocalChange: string) => Promise<boolean>;
  readonly onRemove: (chapterId: string) => Promise<boolean>;
};

export default function ChapterMappingDialog({ nodeTitle, chapters, mappings, busy, onClose, onSave, onRemove }: Props) {
  const initialChapterId = chapters[0]?.id ?? "";
  const initialMapping = mappings.find((mapping) => mapping.chapterId === initialChapterId);
  const [chapterId, setChapterId] = useState(initialChapterId);
  const [segmentIntent, setSegmentIntent] = useState(initialMapping?.segmentIntent ?? "");
  const [expectedLocalChange, setExpectedLocalChange] = useState(initialMapping?.expectedLocalChange ?? "");
  const current = mappings.find((mapping) => mapping.chapterId === chapterId);

  const selectChapter = (id: string) => {
    setChapterId(id);
    const mapping = mappings.find((item) => item.chapterId === id);
    setSegmentIntent(mapping?.segmentIntent ?? "");
    setExpectedLocalChange(mapping?.expectedLocalChange ?? "");
  };

  return <AnimatedDialog aria-labelledby="chapter-mapping-title" busy={busy} onClose={onClose} className="max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
    {({ close }) => <>
      <DialogHeader id="chapter-mapping-title" title={`安排「${nodeTitle}」的章节片段`} description="同一事件可以跨越多章。逐章说明这一段要写什么、人物或局势在本章发生什么变化。" onClose={close} busy={busy} />
      <div className="grid max-h-[60dvh] gap-4 overflow-y-auto px-5 py-4">
        {mappings.length > 0 && <div className="grid gap-2" aria-label="已安排章节">
          {mappings.map((mapping) => <div key={mapping.chapterId} className="rounded-lg border border-border bg-background p-3 text-xs leading-5">
            <b>{chapters.find((chapter) => chapter.id === mapping.chapterId)?.label ?? mapping.chapterId}</b>
            <p className="m-0 text-text-secondary">片段：{mapping.segmentIntent}</p>
            <p className="m-0 text-text-secondary">变化：{mapping.expectedLocalChange}</p>
          </div>)}
        </div>}
        <label className="grid gap-1 text-xs font-medium">章节
          <NativeSelect value={chapterId} disabled={busy || chapters.length === 0} onChange={(event) => selectChapter(event.target.value)}>
            {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.label}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs font-medium">本章片段
          <Input value={segmentIntent} disabled={busy} maxLength={2000} placeholder="例如：发现线索并开始怀疑盟友" onChange={(event) => setSegmentIntent(event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-medium">本章变化
          <Input value={expectedLocalChange} disabled={busy} maxLength={2000} placeholder="例如：从信任转为戒备" onChange={(event) => setExpectedLocalChange(event.target.value)} />
        </label>
      </div>
      <DialogFooter>
        {current && <Button size="sm" variant="danger" disabled={busy} onClick={() => void onRemove(chapterId).then((saved) => { if (saved) { setSegmentIntent(""); setExpectedLocalChange(""); } })}>移出本章</Button>}
        <Button size="sm" disabled={busy} onClick={close}>完成</Button>
        <Button size="sm" loading={busy} disabled={!chapterId || !segmentIntent.trim() || !expectedLocalChange.trim()} onClick={() => void onSave(chapterId, segmentIntent, expectedLocalChange)}>保存本章片段</Button>
      </DialogFooter>
    </>}
  </AnimatedDialog>;
}
