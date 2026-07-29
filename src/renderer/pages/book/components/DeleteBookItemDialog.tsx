import {
  AlertCircle,
  AlertTriangle,
  BookX,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  const [shown, setShown] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const volume = target.kind === "volume";

  const close = useCallback(() => {
    if (submitting || closeTimerRef.current !== null) return;
    setShown(false);
    closeTimerRef.current = window.setTimeout(onClose, 160);
  }, [onClose, submitting]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShown(true);
      cancelButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled])",
        ) ?? [],
      );
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSubmitting(false);
    }
  };

  const itemLabel = volume ? "分卷" : "章节";
  const consequence = volume
    ? `分卷结构将被删除，其中 ${target.chapterCount} 个章节会保留，并自动移动到“未分卷”。`
    : "该章节的正文内容和全部历史版本将被永久删除。";
  const warning = volume
    ? "此操作无法撤销，但不会删除章节正文。"
    : "删除后无法恢复，请确认不再需要此章节。";

  return (
    <div
      className={`fixed inset-0 z-[110] grid place-items-center bg-black/35 p-4 backdrop-blur-[3px] transition-opacity duration-150 ${shown ? "opacity-100" : "opacity-0"}`}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className={`w-full max-w-[456px] overflow-hidden rounded-[20px] border border-white/70 bg-white text-neutral-900 shadow-[0_28px_90px_rgba(0,0,0,0.26)] transition-[opacity,transform] duration-150 ease-out ${shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-1.5 scale-[0.985] opacity-0"}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-book-item-title"
        aria-describedby="delete-book-item-description"
      >
        <div className="relative px-6 pb-5 pt-6">
          <button
            className="absolute right-4 top-4 grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            aria-label="关闭删除确认弹窗"
            disabled={submitting}
            onClick={close}
          >
            <X size={17} strokeWidth={1.8} />
          </button>

          <div className="flex items-start gap-3.5 pr-8">
            <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-red-50 text-red-600 ring-1 ring-red-100">
              {volume
                ? <BookX size={20} strokeWidth={1.9} />
                : <Trash2 size={19} strokeWidth={1.9} />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2
                className="m-0 text-[15px] font-semibold leading-6 tracking-[-0.01em] text-neutral-900"
                id="delete-book-item-title"
              >
                删除{itemLabel}
              </h2>
              <p className="mb-0 mt-1 text-[13px] font-medium leading-5 text-neutral-700">
                确定删除{itemLabel}“{target.title}”吗？
              </p>
              <p
                className="mb-0 mt-1 text-xs leading-5 text-neutral-500"
                id="delete-book-item-description"
              >
                {consequence}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-amber-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span className="text-[11px] leading-[18px]">{warning}</span>
          </div>

          {error && (
            <div
              className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-red-700"
              role="alert"
            >
              <AlertCircle className="mt-0.5 shrink-0" size={15} />
              <span className="min-w-0">
                <strong className="block text-[11px] font-semibold leading-[18px]">
                  删除失败
                </strong>
                <span className="block break-words text-[11px] leading-[18px] text-red-600">
                  {error}
                </span>
              </span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-neutral-100 bg-neutral-50/70 px-6 py-4">
          <button
            ref={cancelButtonRef}
            className="h-9 min-w-20 rounded-lg border border-neutral-200 bg-white px-4 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={submitting}
            onClick={close}
          >
            取消
          </button>
          <button
            className="flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-4 text-xs font-semibold text-white shadow-sm shadow-red-200 transition hover:border-red-700 hover:bg-red-700 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-red-300 disabled:bg-red-300 disabled:shadow-none"
            type="button"
            disabled={submitting}
            onClick={() => void confirm()}
          >
            {submitting && <LoaderCircle className="animate-spin" size={14} />}
            {submitting ? "正在删除" : `删除${itemLabel}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
