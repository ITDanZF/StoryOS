import {
  BookOpen,
  Check,
  CircleAlert,
  FileText,
  Layers3,
  LoaderCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { NovelDto } from "../../../../shared/agent/contracts.ts";

export type BookProfileInput = Pick<NovelDto, "title" | "synopsis">;

type BookProfilePanelProps = {
  readonly book: NovelDto | null;
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly onSave: (input: BookProfileInput) => Promise<void>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 800;
const SAVE_SUCCESS_VISIBLE_MS = 1800;

export default function BookProfilePanel({
  book,
  volumeCount,
  chapterCount,
  characterCount,
  onSave,
}: BookProfilePanelProps) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [synopsis, setSynopsis] = useState(book?.synopsis ?? "");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastSavedRef = useRef<BookProfileInput>({
    title: book?.title ?? "",
    synopsis: book?.synopsis ?? "",
  });
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const incoming = {
      title: book?.title ?? "",
      synopsis: book?.synopsis ?? "",
    };
    const previous = lastSavedRef.current;
    lastSavedRef.current = incoming;
    setTitle((current) => current === previous.title ? incoming.title : current);
    setSynopsis((current) =>
      current === previous.synopsis ? incoming.synopsis : current);
  }, [book?.synopsis, book?.title]);

  const saveCurrent = useCallback(async () => {
    const input = {
      title: title.trim(),
      synopsis: synopsis.trim(),
    };
    if (
      !input.title ||
      saving ||
      (
        input.title === lastSavedRef.current.title &&
        input.synopsis === lastSavedRef.current.synopsis
      )
    ) return;

    setSaving(true);
    setSaveState("saving");
    try {
      await onSaveRef.current(input);
      lastSavedRef.current = input;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  }, [saving, synopsis, title]);

  useEffect(() => {
    const dirty = title.trim() !== lastSavedRef.current.title ||
      synopsis.trim() !== lastSavedRef.current.synopsis;
    if (!title.trim() || !dirty || saving || saveState === "error") return;
    const timeout = window.setTimeout(() => {
      void saveCurrent();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [saveCurrent, saveState, saving, synopsis, title]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timeout = window.setTimeout(() => {
      setSaveState("idle");
    }, SAVE_SUCCESS_VISIBLE_MS);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveCurrent();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
      return;
    }
    event.preventDefault();
    void saveCurrent();
  };

  const beginEditing = () => {
    if (saveState === "error" || saveState === "saved") {
      setSaveState("idle");
    }
  };

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f7f7f5] px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
      <form
        className="mx-auto w-full max-w-[760px]"
        onSubmit={submit}
        onKeyDown={handleKeyDown}
      >
        <header className="mb-6 flex min-h-11 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100">
              <BookOpen size={19} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 text-lg font-semibold tracking-[-0.02em] text-neutral-950">
                书籍概览
              </h1>
              <p className="mb-0 mt-0.5 text-xs text-neutral-400">
                管理书名与故事简介
              </p>
            </div>
          </div>
          <SaveIndicator
            state={saveState}
            onRetry={() => void saveCurrent()}
          />
        </header>

        <section
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          aria-label="书籍基本信息"
        >
          <label className="block bg-[linear-gradient(145deg,#393531_0%,#4b4038_58%,#9a6640_100%)] px-6 py-6 sm:px-7 sm:py-7">
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[#d8a47b]">
              书名
            </span>
            <input
              autoFocus={!book}
              className="mt-3 w-full border-0 bg-transparent p-0 font-serif text-[28px] font-semibold leading-10 tracking-[0.04em] text-[#fff9f2] caret-[#e4b48e] outline-none selection:bg-[#c78658]/45 placeholder:font-normal placeholder:tracking-normal placeholder:text-white/35"
              maxLength={200}
              placeholder="输入书籍名称"
              value={title}
              aria-label="书籍名称"
              onChange={(event) => {
                setTitle(event.target.value);
                beginEditing();
              }}
            />
          </label>

          <label className="block border-t border-neutral-100 px-6 py-5 sm:px-7">
            <span className="block text-[11px] font-medium text-neutral-400">
              书籍简介
            </span>
            <textarea
              className="mt-2 min-h-28 w-full resize-none border-0 bg-transparent p-0 text-sm leading-7 text-neutral-700 outline-none placeholder:text-neutral-300"
              maxLength={4000}
              placeholder="概括故事背景、主要冲突或创作方向"
              value={synopsis}
              aria-label="书籍简介"
              onChange={(event) => {
                setSynopsis(event.target.value);
                beginEditing();
              }}
            />
          </label>

          <div
            className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-neutral-100 bg-neutral-50/70 px-6 py-4 sm:px-7"
            aria-label="创作统计"
          >
            <Statistic
              icon={FileText}
              label="总字数"
              value={characterCount.toLocaleString("zh-CN")}
            />
            <Statistic icon={Layers3} label="分卷" value={volumeCount.toString()} />
            <Statistic icon={BookOpen} label="章节" value={chapterCount.toString()} />
          </div>
        </section>
      </form>
    </main>
  );
}

function Statistic({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: typeof BookOpen;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <Icon className="text-neutral-400" size={14} strokeWidth={1.8} />
      <span>{label}</span>
      <strong className="font-semibold tabular-nums text-neutral-800">{value}</strong>
    </div>
  );
}

function SaveIndicator({
  state,
  onRetry,
}: {
  readonly state: SaveState;
  readonly onRetry: () => void;
}) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <button
        className="mt-1 flex h-7 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-red-50 px-2.5 text-[11px] text-red-600 transition hover:bg-red-100"
        type="button"
        onClick={onRetry}
      >
        <CircleAlert size={12} />
        保存失败 · 重试
      </button>
    );
  }
  return (
    <span className="mt-1 flex h-7 shrink-0 items-center gap-1.5 px-1 text-[11px] text-neutral-400">
      {state === "saving"
        ? <LoaderCircle className="animate-spin" size={12} />
        : <Check className="text-emerald-500" size={12} />}
      {state === "saving" ? "正在保存" : "已保存"}
    </span>
  );
}
