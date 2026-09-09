import { AnimatedDialog } from "../../../components/motion/index.ts";
import {
  BookOpen,
  Check,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  RotateCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BookshelfBookCard } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import { selectAttachableBooks } from "../projectBookOptions.ts";

export type CreateProjectDialogValue = {
  readonly name: string;
  readonly parentPath: string;
  readonly bookId?: string;
};

type CreateProjectDialogProps = {
  readonly defaultParentPath: string;
  readonly defaultName?: string;
  readonly title?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly allowBookshelfImport?: boolean;
  readonly onClose: () => void;
  readonly onCreate: (value: CreateProjectDialogValue) => Promise<void | (() => void)>;
};

export default function CreateProjectDialog({
  defaultParentPath,
  defaultName = "",
  title = "新建项目",
  description = "创建本地项目，并选择是否关联书架中的已有作品。",
  confirmLabel = "创建项目",
  allowBookshelfImport = false,
  onClose,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = useState(defaultName);
  const [nameEdited, setNameEdited] = useState(false);
  const [parentPath, setParentPath] = useState(defaultParentPath);
  const [source, setSource] = useState<"blank" | "bookshelf">("blank");
  const [books, setBooks] = useState<readonly BookshelfBookCard[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [booksLoadVersion, setBooksLoadVersion] = useState(0);
  const [selectingDirectory, setSelectingDirectory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowBookshelfImport) return;
    let active = true;
    setBooksLoading(true);
    setBooksError(null);
    void window.storyOSAgent.getBookshelfBooks()
      .then((result) => {
        if (active) setBooks(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setBooksError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (active) setBooksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowBookshelfImport, booksLoadVersion]);

  const attachableBooks = useMemo(() => selectAttachableBooks(books), [books]);

  const chooseParentPath = async () => {
    setSelectingDirectory(true);
    setError(null);
    try {
      const selectedPath = await window.storyOSWindow.pickDirectory({
        title: "选择项目资源目录",
        defaultPath: parentPath,
      });
      if (selectedPath) setParentPath(selectedPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSelectingDirectory(false);
    }
  };

  const submit = async (event: React.FormEvent, close: (next?: unknown) => void) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedParentPath = parentPath.trim();
    if (submitting || selectingDirectory || !normalizedName || !normalizedParentPath) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await onCreate({
        name: normalizedName,
        parentPath: normalizedParentPath,
        ...(source === "bookshelf" && selectedBookId
          ? { bookId: selectedBookId }
          : {}),
      });
      close(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSubmitting(false);
    }
  };

  const busy = submitting || selectingDirectory;
  const sourceIsValid = source === "blank" || selectedBookId !== null;

  return (
    <AnimatedDialog busy={busy} onClose={onClose} aria-labelledby="create-project-title" className="max-w-[540px] rounded-2xl border border-border bg-card shadow-2xl">
      {({ close }) => <form className="p-5" onSubmit={event => void submit(event, close)}>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-text-secondary"><FolderPlus size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-sm font-semibold" id="create-project-title">{title}</h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
          </div>
          <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-muted-foreground hover:bg-muted" type="button" aria-label="关闭" onClick={close} disabled={busy}><X size={16} /></button>
        </div>

        {allowBookshelfImport && (
          <div className="mt-4 grid gap-2">
            <span className="text-[11px] font-medium text-text-secondary">项目来源</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="项目来源">
              <button
                className={cn(
                  "flex min-h-16 items-start gap-2.5 rounded-xl border p-3 text-left transition",
                  source === "blank"
                    ? "border-primary bg-surface-subtle shadow-sm"
                    : "border-border bg-card hover:border-border-strong hover:bg-surface-subtle",
                )}
                type="button"
                aria-pressed={source === "blank"}
                disabled={busy}
                onClick={() => setSource("blank")}
              >
                <FilePlus2 className="mt-0.5 shrink-0" size={17} />
                <span className="grid gap-0.5">
                  <strong className="text-xs font-semibold">空白项目</strong>
                  <span className="text-[10px] leading-4 text-muted-foreground">创建一本新的作品</span>
                </span>
              </button>
              <button
                className={cn(
                  "flex min-h-16 items-start gap-2.5 rounded-xl border p-3 text-left transition",
                  source === "bookshelf"
                    ? "border-primary bg-surface-subtle shadow-sm"
                    : "border-border bg-card hover:border-border-strong hover:bg-surface-subtle",
                )}
                type="button"
                aria-pressed={source === "bookshelf"}
                disabled={busy}
                onClick={() => setSource("bookshelf")}
              >
                <BookOpen className="mt-0.5 shrink-0" size={17} />
                <span className="grid gap-0.5">
                  <strong className="text-xs font-semibold">从书架关联</strong>
                  <span className="text-[10px] leading-4 text-muted-foreground">使用已有作品资源</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {allowBookshelfImport && source === "bookshelf" && (
          <div className="mt-3 rounded-xl border border-border bg-surface-subtle p-2">
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
              <span className="text-[10px] leading-4 text-muted-foreground">
                关联正文、卷章与角色等资源，不会复制书籍数据。
              </span>
              {!booksLoading && !booksError && (
                <span className="shrink-0 text-[10px] text-text-subtle">
                  可用 {attachableBooks.length} 本
                </span>
              )}
            </div>
            {booksLoading ? (
              <div className="flex h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="animate-spin" size={15} />正在读取书架…
              </div>
            ) : booksError ? (
              <div className="grid min-h-20 place-items-center gap-2 rounded-lg bg-danger-surface p-3 text-center">
                <span className="text-[11px] text-danger-text">书架读取失败：{booksError}</span>
                <button
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-danger-border bg-card px-2.5 text-[10px] text-danger-text hover:bg-danger-surface"
                  type="button"
                  onClick={() => setBooksLoadVersion((value) => value + 1)}
                >
                  <RotateCw size={12} />重新读取
                </button>
              </div>
            ) : attachableBooks.length === 0 ? (
              <div className="grid h-20 place-items-center px-4 text-center text-[11px] leading-5 text-muted-foreground">
                暂无可关联作品。书架中已绑定项目或存储不可用的作品不会显示。
              </div>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {attachableBooks.map((book) => {
                  const selected = selectedBookId === book.bookId;
                  return (
                    <button
                      key={book.bookId}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                        selected
                          ? "border-primary bg-card shadow-sm"
                          : "border-transparent bg-transparent hover:border-border hover:bg-card",
                      )}
                      type="button"
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => {
                        setSelectedBookId(book.bookId);
                        if (!nameEdited || !name.trim()) setName(book.title);
                      }}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-text-secondary">
                        <BookOpen size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs font-medium text-foreground">{book.title}</strong>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {book.volumeCount} 卷 · {book.chapterCount} 章
                        </span>
                      </span>
                      <span className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-card text-transparent",
                      )}>
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-text-secondary">
          <span>项目名称</span>
          <input className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none transition focus:border-border-strong focus:ring-4 focus:ring-black/5" autoFocus maxLength={80} placeholder="例如：我的故事" value={name} onChange={(event) => { setName(event.target.value); setNameEdited(true); }} disabled={busy} />
        </label>

        <div className="mt-4 grid gap-1.5">
          <span className="text-[11px] font-medium text-text-secondary">项目资源目录</span>
          <button
            className="group flex h-11 w-full items-center gap-2.5 rounded-xl border border-border bg-surface-subtle px-3 text-left text-xs text-muted-foreground transition hover:border-border-strong hover:bg-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/5 disabled:cursor-wait disabled:opacity-60"
            type="button"
            title={parentPath}
            disabled={busy}
            onClick={() => void chooseParentPath()}
          >
            <FolderOpen className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" size={17} />
            <span className="min-w-0 flex-1 truncate">{selectingDirectory ? "正在选择目录…" : parentPath}</span>
          </button>
        </div>

        {error && <p className="mb-0 mt-3 rounded-lg bg-danger-surface px-3 py-2 text-[11px] text-danger-text">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-medium hover:bg-surface-subtle disabled:opacity-50" type="button" disabled={busy} onClick={close}>取消</button>
          <button className="h-9 rounded-lg border border-primary bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={busy || !name.trim() || !parentPath.trim() || !sourceIsValid}>{submitting ? "正在创建…" : confirmLabel}</button>
        </div>
      </form>}
    </AnimatedDialog>
  );
}
