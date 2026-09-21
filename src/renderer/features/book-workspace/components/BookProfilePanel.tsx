import {
  ArrowRight,
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
import type {
  BookWorkspaceChapterDto,
  NovelDto,
} from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import {
  getBookshelfTheme,
  selectDefaultBookshelfTheme,
} from "../../book-presentation/coverThemes.ts";
import { BOOK_STATUS_LABELS } from "../../bookshelf/bookshelfModel.ts";
import {
  chapterStatusLabel,
  countCompletedChapters,
  selectContinueChapter,
  selectRecentBookChapters,
} from "../bookWorkspaceModel.ts";
import "./bookWorkspace.css";

export type BookProfileInput = Pick<NovelDto, "title" | "synopsis">;

type BookProfilePanelProps = {
  readonly book: NovelDto | null;
  readonly chapters: readonly BookWorkspaceChapterDto[];
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly onSelectChapter: ((chapterId: string) => void) | null;
  readonly onSave: (input: BookProfileInput) => Promise<void>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 800;
const SAVE_SUCCESS_VISIBLE_MS = 1800;

export default function BookProfilePanel({
  book,
  chapters,
  volumeCount,
  chapterCount,
  characterCount,
  onSelectChapter,
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

  const completedCount = countCompletedChapters(chapters);
  const recentChapters = selectRecentBookChapters(chapters);
  const continueChapter = selectContinueChapter(chapters);
  const completionPercent = chapterCount === 0
    ? 0
    : Math.round((completedCount / chapterCount) * 100);
  const coverTheme = getBookshelfTheme(
    selectDefaultBookshelfTheme(book?.id ?? "uninitialized"),
  );

  return (
    <main className="motion-reveal min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-canvas px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
      <form
        className="mx-auto w-full max-w-[760px]"
        onSubmit={submit}
        onKeyDown={handleKeyDown}
      >
        <header className="mb-5 flex min-h-10 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground ring-1 ring-inset ring-accent-border">
              <BookOpen size={18} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="mb-0 text-xs text-text-subtle">
                书名与简介
              </p>
              {book && (
                <p className="mb-0 mt-0.5 text-xs font-medium text-accent-foreground">
                  {BOOK_STATUS_LABELS[book.status]}
                </p>
              )}
            </div>
          </div>
          <SaveIndicator
            state={saveState}
            onRetry={() => void saveCurrent()}
          />
        </header>

        <section
          className="overflow-hidden rounded-2xl border border-border bg-card"
          aria-label="书籍基本信息"
        >
          <label
            className={cn(
              "block px-6 py-6 sm:px-7 sm:py-7",
              coverTheme.coverClassName,
              coverTheme.textClassName,
            )}
            data-cover-theme={coverTheme.id}
          >
            <span
              className={cn(
                "block text-xs font-medium tracking-[0.14em]",
                coverTheme.mutedTextClassName,
              )}
            >
              书名
            </span>
            <input
              autoFocus={!book}
              className="mt-3 w-full border-0 bg-transparent p-0 font-serif text-[28px] font-semibold leading-10 tracking-[0.04em] text-inherit caret-current outline-none placeholder:font-normal placeholder:tracking-normal placeholder:opacity-55 selection:bg-current/25"
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

          <label className="block border-t border-border px-6 py-5 sm:px-7">
            <span className="block text-xs font-medium text-text-subtle">
              书籍简介
            </span>
            <textarea
              className="mt-2 min-h-28 w-full resize-none border-0 bg-transparent p-0 text-sm leading-7 text-text-secondary outline-none placeholder:text-text-subtle"
              maxLength={4000}
              placeholder="写下这本书想讲的故事：时代、人物，以及他们必须面对的冲突。"
              value={synopsis}
              aria-label="书籍简介"
              onChange={(event) => {
                setSynopsis(event.target.value);
                beginEditing();
              }}
            />
          </label>

          <div
            className="grid gap-4 border-t border-border bg-surface-subtle/70 px-6 py-4 sm:px-7"
            aria-label="创作统计"
          >
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
              <Statistic
                icon={FileText}
                label="总字数"
                value={characterCount.toLocaleString("zh-CN")}
              />
              <Statistic icon={Layers3} label="分卷" value={volumeCount.toString()} />
              <Statistic icon={BookOpen} label="章节" value={chapterCount.toString()} />
            </div>
            {chapterCount > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>已完成章节</span>
                  <strong className="font-semibold tabular-nums text-foreground">
                    {completedCount} / {chapterCount} · {completionPercent}%
                  </strong>
                </div>
                <div
                  className="book-chapter-progress"
                  role="progressbar"
                  aria-label="已完成章节进度"
                  aria-valuemin={0}
                  aria-valuemax={chapterCount}
                  aria-valuenow={completedCount}
                >
                  <span style={{ width: `${completionPercent}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {onSelectChapter && continueChapter && (
          <button
            className="mt-5 flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-accent-border bg-accent px-4 text-left text-sm font-medium text-accent-foreground transition-colors hover:bg-accent"
            type="button"
            onClick={() => onSelectChapter(continueChapter.id)}
          >
            <span className="min-w-0 truncate">
              继续写作 · {continueChapter.title}
            </span>
            <ArrowRight size={16} />
          </button>
        )}

        {onSelectChapter && recentChapters.length > 0 && (
          <section className="mt-8" aria-label="最近章节">
            <h2 className="mb-3 text-xs font-medium text-text-subtle">
              最近章节
            </h2>
            <ul className="grid gap-2">
              {recentChapters.map((chapter) => (
                <li key={chapter.id}>
                  <button
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-accent-border hover:bg-accent/60"
                    type="button"
                    onClick={() => onSelectChapter(chapter.id)}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-[13px] font-medium text-foreground">
                        {chapter.title}
                      </strong>
                      <span className="mt-0.5 block text-xs text-text-subtle">
                        {chapterStatusLabel(chapter)}
                        {" · "}
                        {chapter.characterCount.toLocaleString("zh-CN")} 字
                      </span>
                    </span>
                    <ArrowRight className="shrink-0 text-text-subtle" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
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
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="text-text-subtle" size={14} strokeWidth={1.8} />
      <span>{label}</span>
      <strong className="font-semibold tabular-nums text-foreground">{value}</strong>
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
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-danger-surface px-2.5 text-xs text-danger-text transition-colors hover:bg-danger-surface"
        type="button"
        onClick={onRetry}
      >
        <CircleAlert size={12} />
        保存失败 · 重试
      </button>
    );
  }
  return (
    <span className="flex h-7 shrink-0 items-center gap-1.5 px-1 text-xs text-text-subtle">
      {state === "saving"
        ? <LoaderCircle className="animate-spin" size={12} />
        : <Check className="text-success-text" size={12} />}
      {state === "saving" ? "正在保存" : "已保存"}
    </span>
  );
}
