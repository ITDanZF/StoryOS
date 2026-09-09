import { AnimatedDialog } from "../../../components/motion/index.ts";
import {
  AlertCircle,
  AlertTriangle,
  BookX,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

export type DeleteBookItemTarget =
  | {
      readonly kind: "volume";
      readonly id: string;
      readonly title: string;
      readonly chapterCount: number;
    }
  | {
      readonly kind: "chapter";
      readonly id: string;
      readonly title: string;
    }
  | {
      readonly kind: "page";
      readonly title: string;
      readonly chapterPageNumber: number;
    };

type DeleteBookItemDialogProps = {
  readonly target: DeleteBookItemTarget;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered")) {
    return "删除服务尚未加载，请完全重启 StoryOS 后重试。";
  }
  return message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/u, "")
    .trim();
}

export default function DeleteBookItemDialog({
  target,
  onClose,
  onConfirm,
}: DeleteBookItemDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const volume = target.kind === "volume";
  const page = target.kind === "page";

  const confirm = async (close: () => void) => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm();
      close();
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSubmitting(false);
    }
  };

  const itemLabel = volume ? "分卷" : page ? "页面" : "章节";
  const consequence = volume
    ? `分卷结构将被删除，其中 ${target.chapterCount} 个章节会保留，并自动移动到“未分卷”。`
    : page
      ? `第 ${target.chapterPageNumber} 页的正文内容将从章节“${target.title}”中删除，后续内容会自动重新分页。`
      : "该章节的正文内容和全部历史版本将被永久删除。";
  const warning = volume
    ? "此操作无法撤销，但不会删除章节正文。"
    : page
      ? "删除后可立即使用编辑器撤销恢复；离开章节前请确认结果。"
      : "删除后无法恢复，请确认不再需要此章节。";
  const question = page
    ? `确定删除第 ${target.chapterPageNumber} 页吗？`
    : `确定删除${itemLabel}“${target.title}”吗？`;

  return (
    <AnimatedDialog busy={submitting} onClose={onClose} role="alertdialog" aria-labelledby="delete-book-item-title" aria-describedby="delete-book-item-description" className="max-w-[456px] rounded-[20px] border border-border bg-card text-foreground shadow-2xl">
      {({ close }) => <>
        <div className="relative px-6 pb-5 pt-6">
          <button
            className="absolute right-4 top-4 grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-text-subtle transition hover:bg-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            aria-label="关闭删除确认弹窗"
            disabled={submitting}
            onClick={close}
          >
            <X size={17} strokeWidth={1.8} />
          </button>

          <div className="flex items-start gap-3.5 pr-8">
            <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-danger-surface text-danger-text ring-1 ring-danger-border">
              {volume
                ? <BookX size={20} strokeWidth={1.9} />
                : <Trash2 size={19} strokeWidth={1.9} />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2
                className="m-0 text-[15px] font-semibold leading-6 tracking-[-0.01em] text-foreground"
                id="delete-book-item-title"
              >
                删除{itemLabel}
              </h2>
              <p className="mb-0 mt-1 text-[13px] font-medium leading-5 text-text-secondary">
                {question}
              </p>
              <p
                className="mb-0 mt-1 text-xs leading-5 text-muted-foreground"
                id="delete-book-item-description"
              >
                {consequence}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning-border bg-warning-surface/70 px-3 py-2.5 text-warning-text">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span className="text-[11px] leading-[18px]">{warning}</span>
          </div>

          {error && (
            <div
              className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-surface px-3 py-2.5 text-danger-text"
              role="alert"
            >
              <AlertCircle className="mt-0.5 shrink-0" size={15} />
              <span className="min-w-0">
                <strong className="block text-[11px] font-semibold leading-[18px]">
                  删除失败
                </strong>
                <span className="block break-words text-[11px] leading-[18px] text-danger-text">
                  {error}
                </span>
              </span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-border bg-surface-subtle/70 px-6 py-4">
          <button
            autoFocus
            className="h-9 min-w-20 rounded-lg border border-border bg-card px-4 text-xs font-medium text-text-secondary shadow-sm transition hover:border-border-strong hover:bg-surface-subtle active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={submitting}
            onClick={close}
          >
            取消
          </button>
          <button
            className="flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border border-danger-border bg-destructive px-4 text-xs font-semibold text-inverse shadow-sm shadow-red-200 transition hover:border-danger-border hover:bg-destructive hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-border focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-danger-border disabled:bg-danger-surface disabled:shadow-none"
            type="button"
            disabled={submitting}
            onClick={() => void confirm(close)}
          >
            {submitting && <LoaderCircle className="animate-spin" size={14} />}
            {submitting ? "正在删除" : `删除${itemLabel}`}
          </button>
        </footer>
      </>}
    </AnimatedDialog>
  );
}
