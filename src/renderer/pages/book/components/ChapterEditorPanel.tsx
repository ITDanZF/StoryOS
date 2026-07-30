import {
  Check,
  History,
  MoreHorizontal,
  TriangleAlert,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import type {
  BookWorkspaceChapterDto,
} from "../../../../shared/agent/contracts.ts";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
} from "../../../../shared/book/richText.ts";
import type { BookSaveState } from "../bookWorkspaceModel.ts";
import type { BookPageNavigationTarget } from "../pagination/bookPagination.ts";

const ChapterRichTextEditor = lazy(
  () => import("../editor/ChapterRichTextEditor.tsx"),
);

type ChapterEditorPanelProps = {
  readonly chapter: BookWorkspaceChapterDto;
  readonly chapterNumber: number;
  readonly volumeTitle: string;
  readonly pageTarget: BookPageNavigationTarget | null;
  readonly onPageChange: (chapterPageNumber: number) => void;
  readonly onSaveTitle: (title: string) => Promise<void>;
  readonly onSaveContent: (content: string) => Promise<void>;
  readonly onAskAi: (prompt: string) => void;
};

export default function ChapterEditorPanel({
  chapter,
  chapterNumber,
  volumeTitle,
  pageTarget,
  onPageChange,
  onSaveTitle,
  onSaveContent,
  onAskAi,
}: ChapterEditorPanelProps) {
  const [title, setTitle] = useState(chapter.title);
  const [saveState, setSaveState] = useState<BookSaveState>("saved");
  const [characterCount, setCharacterCount] = useState(() =>
    countTiptapCharacters(decodeStoredChapterContent(chapter.content)));

  useEffect(() => {
    setTitle(chapter.title);
    setSaveState("saved");
    setCharacterCount(
      countTiptapCharacters(decodeStoredChapterContent(chapter.content)),
    );
  }, [chapter.content, chapter.id, chapter.title]);

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

  const askAiAboutSelection = (selection: string | null) => {
    onAskAi(selection
      ? `请帮我分析并润色这段文字：\n“${selection}”`
      : `请分析第${chapterNumber}章《${title}》的节奏和氛围。`);
  };

  return (
    <article className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3 sm:px-5 lg:px-7 2xl:min-h-[84px] 2xl:px-8">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-[10px] font-medium tracking-[0.03em] text-neutral-400">
            {volumeTitle} · 第 {chapterNumber} 章
          </span>
          <input
            className="min-w-0 max-w-[420px] border-0 bg-transparent p-0 text-xl font-bold tracking-tight text-neutral-900 outline-none sm:text-[22px] 2xl:text-2xl"
            value={title}
            aria-label="章节标题"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(chapter.title);
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-neutral-400 sm:gap-2.5">
          <span className="hidden items-center gap-1 sm:inline-flex">
            {saveState === "saved" && <Check size={12} />}
            {saveState === "error" && (
              <TriangleAlert className="text-red-500" size={12} />
            )}
            {saveState === "saved"
              ? "已保存"
              : saveState === "saving" ? "保存中…" : "保存失败"}
          </span>
          <span>{characterCount.toLocaleString("zh-CN")} 字</span>
          <button
            className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 hover:text-neutral-800"
            type="button"
            aria-label="历史版本"
          >
            <History size={15} />
          </button>
          <button
            className="grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 hover:text-neutral-800"
            type="button"
            aria-label="章节菜单"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="grid min-h-0 flex-1 place-items-center bg-[#f6f6f4] text-xs text-neutral-400">
            正在载入编辑器…
          </div>
        }
      >
        <ChapterRichTextEditor
          key={chapter.id}
          chapterNumber={chapterNumber}
          content={chapter.content}
          pageTarget={pageTarget}
          onPageChange={onPageChange}
          onSave={onSaveContent}
          onSaveStateChange={setSaveState}
          onCharacterCountChange={setCharacterCount}
          onAskAiSelection={askAiAboutSelection}
        />
      </Suspense>
    </article>
  );
}
