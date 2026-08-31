import {
  AlertTriangle,
  ArchiveRestore,
  Download,
  Link2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type { BookshelfBookCard as BookshelfBookCardDto } from "../../../../shared/agent/contracts.ts";
import { cn } from "../../../../lib/utils.ts";
import {
  BOOK_STATUS_LABELS,
  BOOK_STORAGE_LABELS,
  formatCharacterCount,
  formatRelativeTime,
} from "../bookshelfModel.ts";
import {
  getBookshelfTheme,
  selectDefaultBookshelfTheme,
  type BookshelfThemeDecoration,
} from "../bookshelfThemes.ts";
import type { BookshelfView } from "./BookshelfToolbar.tsx";

type ReadyBook = Extract<BookshelfBookCardDto, { availability: "ready" }>;

function ThemeDecoration({ decoration }: {
  readonly decoration: BookshelfThemeDecoration;
}) {
  if (decoration === "rain") return <span className="absolute inset-0 bg-[repeating-linear-gradient(108deg,transparent_0_18px,rgba(210,220,225,.08)_19px,transparent_20px_32px),radial-gradient(circle_at_72%_33%,rgba(214,155,93,.28),transparent_16%)]" />;
  if (decoration === "orbit") return <span className="absolute left-[18%] top-[18%] size-24 rounded-full border border-white/20 before:absolute before:-inset-x-5 before:inset-y-8 before:-rotate-12 before:rounded-[50%] before:border before:border-white/15 before:content-[''] after:absolute after:right-1 after:top-3 after:size-1.5 after:rounded-full after:bg-white after:shadow-[18px_31px_0_-1px_rgba(255,255,255,.8),-25px_42px_0_-1px_rgba(255,255,255,.7)] after:content-['']" />;
  if (decoration === "fog") return <span className="absolute inset-x-0 top-[26%] h-20 bg-[linear-gradient(165deg,transparent_46%,rgba(218,229,222,.16)_47%_50%,transparent_51%),radial-gradient(ellipse_at_center,rgba(225,235,230,.18),transparent_68%)]" />;
  if (decoration === "fibers") return <span className="absolute inset-0 bg-[repeating-linear-gradient(4deg,transparent_0_9px,rgba(85,62,42,.045)_10px,transparent_11px_17px),radial-gradient(circle_at_72%_28%,rgba(255,255,255,.36),transparent_24%)]" />;
  if (decoration === "canopy") return <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_12%,rgba(179,214,165,.25),transparent_24%),radial-gradient(ellipse_at_82%_40%,rgba(133,175,135,.18),transparent_28%),linear-gradient(120deg,transparent_42%,rgba(213,232,197,.1)_43%_45%,transparent_46%)]" />;
  if (decoration === "embers") return <span className="absolute inset-0 bg-[radial-gradient(circle_at_65%_26%,rgba(255,162,82,.8)_0_1px,transparent_2px),radial-gradient(circle_at_35%_44%,rgba(255,110,55,.7)_0_1px,transparent_2px),radial-gradient(circle_at_78%_63%,rgba(255,190,90,.55)_0_1px,transparent_2px),radial-gradient(ellipse_at_52%_100%,rgba(197,65,32,.3),transparent_52%)]" />;
  if (decoration === "petals") return <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_18%,rgba(255,242,241,.56)_0_3px,transparent_4px),radial-gradient(ellipse_at_42%_34%,rgba(255,229,232,.45)_0_4px,transparent_5px),radial-gradient(ellipse_at_84%_54%,rgba(255,240,242,.38)_0_3px,transparent_4px)]" />;
  if (decoration === "facets") return <span className="absolute inset-0 bg-[linear-gradient(125deg,transparent_22%,rgba(230,250,255,.22)_23%_42%,transparent_43%),linear-gradient(42deg,transparent_48%,rgba(216,245,250,.16)_49%_67%,transparent_68%)]" />;
  if (decoration === "dunes") return <span className="absolute inset-x-0 bottom-[18%] h-24 rounded-[50%_50%_0_0] bg-[radial-gradient(ellipse_at_42%_100%,rgba(255,221,163,.28),transparent_62%),linear-gradient(172deg,transparent_0_45%,rgba(80,45,30,.18)_46%_48%,transparent_49%)]" />;
  return <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_68%_28%,rgba(30,31,29,.28),transparent_18%),radial-gradient(ellipse_at_42%_44%,rgba(40,42,38,.18),transparent_28%),linear-gradient(130deg,transparent_46%,rgba(255,255,255,.24)_47%_53%,transparent_54%)] blur-[.2px]" />;
}

function BookCover({
  book,
  index,
  compact,
}: {
  readonly book: ReadyBook;
  readonly index: number;
  readonly compact: boolean;
}) {
  const theme = getBookshelfTheme(selectDefaultBookshelfTheme(book.bookId));
  return (
    <div className={cn("relative flex min-h-52 flex-col overflow-hidden border-r border-black/10 px-4 py-4 text-left", compact && "min-h-28 px-3 py-3", theme.coverClassName, theme.textClassName)} aria-hidden="true">
      <span className={cn("relative z-10 text-[7px] tracking-[0.16em]", theme.mutedTextClassName)}>{book.status === "writing" ? "IN PROGRESS" : book.status.toUpperCase()}</span>
      <ThemeDecoration decoration={theme.decoration} />
      <span className="relative z-10 mt-auto grid gap-2">
        <strong className={cn("max-w-[4em] font-serif text-[24px] font-medium leading-tight tracking-[0.1em]", compact && "text-lg")}>{book.title}</strong>
      </span>
      {!compact && <b className={cn("absolute bottom-3 right-3 z-10 text-[22px] font-light", theme.numberClassName)}>{String(index + 1).padStart(2, "0")}</b>}
      <span className={cn("absolute inset-y-0 left-0 w-2 bg-gradient-to-r", theme.spineClassName)} />
    </div>
  );
}

export default function BookshelfBookCard({
  book,
  index,
  view,
  busy,
  exporting,
  onOpen,
  onExport,
  onArchives,
  onTrash,
}: {
  readonly book: BookshelfBookCardDto;
  readonly index: number;
  readonly view: BookshelfView;
  readonly busy: boolean;
  readonly exporting: boolean;
  readonly onOpen: (book: ReadyBook) => void;
  readonly onExport: (book: ReadyBook) => void;
  readonly onArchives: (book: ReadyBook) => void;
  readonly onTrash: (book: ReadyBook) => void;
}) {
  const listView = view === "list";
  if (book.availability === "unavailable") {
    return (
      <article className={cn("grid min-w-0 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm", listView ? "grid-cols-[88px_minmax(0,1fr)]" : "grid-cols-[42%_minmax(0,1fr)]")}>
        <div className={cn("grid min-h-52 place-items-center border-r border-amber-200 bg-amber-50 text-amber-700", listView && "min-h-28")}><AlertTriangle size={24} /></div>
        <div className="flex min-w-0 flex-col p-4">
          <span className="text-[9px] font-semibold text-amber-700">{BOOK_STORAGE_LABELS[book.storageState]}</span>
          <strong className="mt-2 text-sm text-neutral-900">无法读取的书籍</strong>
          <code className="mt-1 truncate text-[8px] text-neutral-400" title={book.bookId}>{book.bookId}</code>
          <p className="mb-0 mt-3 line-clamp-3 text-[10px] leading-5 text-neutral-500" title={book.reason}>{book.reason}</p>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("group grid min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_7px_22px_rgba(30,28,20,.045)] transition duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_15px_32px_rgba(30,28,20,.09)]", listView ? "grid-cols-[88px_minmax(0,1fr)]" : "grid-cols-[42%_minmax(0,1fr)]")}>
      <button className="border-0 bg-transparent p-0 text-left" type="button" aria-label={`打开《${book.title}》`} disabled={busy} onClick={() => onOpen(book)}><BookCover book={book} index={index} compact={listView} /></button>
      <div className={cn("relative flex min-w-0 flex-col p-4", listView && "py-3.5")}>
        <details className="absolute right-2.5 top-2.5 z-10">
          <summary className="grid size-7 list-none place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 [&::-webkit-details-marker]:hidden" aria-label={`管理《${book.title}》`}><MoreHorizontal size={15} /></summary>
          <div className="absolute right-0 top-8 w-36 rounded-xl border border-neutral-200 bg-white p-1 shadow-xl">
            <button className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-[10px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50" type="button" disabled={busy} onClick={() => onExport(book)}><Download size={13} />{exporting ? "正在导出" : "导出书籍"}</button>
            <button className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-[10px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50" type="button" disabled={busy} onClick={() => onArchives(book)}><ArchiveRestore size={13} />项目归档</button>
            <button className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-[10px] text-red-600 hover:bg-red-50 disabled:opacity-50" type="button" disabled={busy} aria-disabled={book.linkedProjectId !== null} title={book.linkedProjectId ? "书籍仍关联写作项目，不能回收" : "移入回收站"} onClick={() => onTrash(book)}><Trash2 size={13} />移入回收站</button>
          </div>
        </details>

        <button className={cn("grid min-w-0 gap-2 border-0 bg-transparent p-0 pr-7 text-left", listView && "gap-1")} type="button" disabled={busy} onClick={() => onOpen(book)}>
          <span className="flex items-center gap-1.5 text-[8px] font-semibold text-neutral-400">
            {BOOK_STATUS_LABELS[book.status]}
            {book.linkedProjectId ? <span className="text-emerald-600">· 已关联</span> : <span className="flex items-center gap-1 text-amber-600"><Link2 size={9} />待创建项目</span>}
          </span>
          <strong className={cn("truncate font-serif text-[17px] font-semibold leading-tight text-neutral-900", listView && "text-[15px]")}>{book.title}</strong>
          <span className={cn("overflow-hidden font-serif text-[11px] leading-[1.75] text-neutral-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]", listView && "[-webkit-line-clamp:1]")}>{book.synopsis || "这个故事还没有简介。"}</span>
        </button>

        <footer className="mt-auto flex items-center gap-1.5 border-t border-neutral-100 pt-3 text-[9px] text-neutral-400">
          <span>{book.chapterCount} 章</span><i className="size-0.5 rounded-full bg-neutral-300" /><span>{formatCharacterCount(book.characterCount)} 字</span><time className="ml-auto" dateTime={book.updatedAt}>{formatRelativeTime(book.updatedAt)}</time>
        </footer>
      </div>
    </article>
  );
}
