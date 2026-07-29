import {
  Check,
  History,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  BookWorkspaceChapterDto,
} from "../../../../shared/agent/contracts.ts";
import { countCharacters } from "../bookWorkspaceModel.ts";

type ChapterEditorPanelProps = {
  readonly chapter: BookWorkspaceChapterDto;
  readonly chapterNumber: number;
  readonly volumeTitle: string;
  readonly onSaveTitle: (title: string) => Promise<void>;
  readonly onSaveContent: (content: string) => Promise<void>;
  readonly onAskAi: (prompt: string) => void;
};

export default function ChapterEditorPanel({
  chapter,
  chapterNumber,
  volumeTitle,
  onSaveTitle,
  onSaveContent,
  onAskAi,
}: ChapterEditorPanelProps) {
  const [title, setTitle] = useState(chapter.title);
  const [saveState, setSaveState] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [characterCount, setCharacterCount] = useState(
    countCharacters(chapter.content),
  );
  const saveTimer = useRef<number | null>(null);
  const contentDraft = useRef(chapter.content);
  const saveSequence = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setTitle(chapter.title);
    setSaveState("saved");
    setCharacterCount(countCharacters(chapter.content));
    contentDraft.current = chapter.content;
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (contentDraft.current !== chapter.content) {
          void onSaveContent(contentDraft.current);
        }
      }
    };
  }, [chapter.id]);

  const persistContent = (content: string) => {
    setSaveState("saving");
    saveSequence.current = saveSequence.current
      .catch((): void => undefined)
      .then(() => onSaveContent(content))
      .then(() => setSaveState("saved"))
      .catch((): void => setSaveState("error"));
  };

  const queueContentSave = (content: string) => {
    setSaveState("saving");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      persistContent(content);
    }, 800);
  };

  const flushContentSave = () => {
    if (saveTimer.current === null) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    persistContent(contentDraft.current);
  };

  const saveTitle = async () => {
    const normalized = title.trim();
    if (!normalized) {
      setTitle(chapter.title);
      return;
    }
    if (normalized === chapter.title) return;
    setSaveState("saving");
    try {
      await onSaveTitle(normalized);
      setTitle(normalized);
      setSaveState("saved");
    } catch {
      setTitle(chapter.title);
      setSaveState("error");
    }
  };

  const runFormatCommand = (command: "bold" | "italic" | "formatBlock") => {
    document.execCommand(
      command,
      false,
      command === "formatBlock" ? "blockquote" : undefined,
    );
  };

  const askAiAboutSelection = () => {
    const selection = window.getSelection()?.toString().trim();
    onAskAi(selection
      ? `请帮我分析并润色这段文字：\n“${selection}”`
      : `请分析第${chapterNumber}章《${chapter.title}》的节奏和氛围。`);
  };

  return (
    <article className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3 sm:px-5 lg:px-7 2xl:min-h-[84px] 2xl:px-8">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-[10px] font-medium tracking-[0.03em] text-neutral-400">{volumeTitle} · 第 {chapterNumber} 章</span>
          <input className="min-w-0 max-w-[420px] border-0 bg-transparent p-0 text-xl font-bold tracking-tight text-neutral-900 outline-none sm:text-[22px] 2xl:text-2xl" value={title} aria-label="章节标题" onChange={(event) => setTitle(event.target.value)} onBlur={() => void saveTitle()} onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTitle(chapter.title);
              event.currentTarget.blur();
            }
          }} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-neutral-400 sm:gap-2.5">
          <span className="hidden items-center gap-1 sm:inline-flex">
            {saveState === "saved" && <Check size={12} />}
            {saveState === "saved"
              ? "已保存"
              : saveState === "saving" ? "保存中…" : "保存失败"}
          </span>
          <span>{characterCount.toLocaleString("zh-CN")} 字</span>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 hover:text-neutral-800" type="button" aria-label="历史版本"><History size={15} /></button>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 hover:text-neutral-800" type="button" aria-label="章节菜单"><MoreHorizontal size={16} /></button>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-neutral-100 px-3 text-neutral-600 sm:px-4 lg:px-6" aria-label="编辑工具栏">
        <button className="h-8 rounded-md border-0 bg-transparent px-2.5 text-[11px] hover:bg-neutral-100" type="button">正文⌄</button>
        <span className="mx-1.5 h-4 w-px bg-neutral-200" />
        <button className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-xs hover:bg-neutral-100" type="button" aria-label="加粗" onMouseDown={(event) => { event.preventDefault(); runFormatCommand("bold"); }}><b>B</b></button>
        <button className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-xs hover:bg-neutral-100" type="button" aria-label="斜体" onMouseDown={(event) => { event.preventDefault(); runFormatCommand("italic"); }}><i>I</i></button>
        <button className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[13px] hover:bg-neutral-100" type="button" aria-label="引用" onMouseDown={(event) => { event.preventDefault(); runFormatCommand("formatBlock"); }}>“</button>
        <span className="mx-1.5 h-4 w-px bg-neutral-200" />
        <button className="ml-auto flex h-8 items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 text-[11px] font-medium text-violet-600 hover:bg-violet-50" type="button" onClick={askAiAboutSelection}><Sparkles size={14} />询问 AI</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f6f4] px-[clamp(14px,4vw,56px)] pb-16 pt-[clamp(20px,4vw,40px)]">
        <div className="mx-auto min-h-full w-full max-w-[760px] rounded-md border border-neutral-200 bg-white shadow-[0_12px_36px_rgba(30,28,20,0.05)]">
          <div key={chapter.id} className="min-h-[650px] px-[clamp(26px,7vw,92px)] py-[clamp(36px,6vw,80px)] font-serif text-[15px] leading-[2.05] text-neutral-800 caret-violet-600 outline-none selection:bg-violet-100 sm:text-base 2xl:text-[17px] [&_p]:mb-[1.15em] [&_p]:indent-[2em]" contentEditable suppressContentEditableWarning spellCheck={false} aria-label="章节正文" data-placeholder="在这里开始书写章节正文……" onInput={(event) => {
            contentDraft.current = event.currentTarget.innerText;
            setCharacterCount(countCharacters(contentDraft.current));
            queueContentSave(contentDraft.current);
          }} onBlur={flushContentSave}>
            {chapter.content
              ? chapter.content.split(/\n\n/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))
              : null}
          </div>
          <footer className="flex items-center justify-between border-t border-neutral-100 px-6 py-4 text-[10px] text-neutral-400">
            <span>第 {chapterNumber} 章</span>
            <span>StoryOS 自动保存已开启</span>
          </footer>
        </div>
      </div>
    </article>
  );
}
