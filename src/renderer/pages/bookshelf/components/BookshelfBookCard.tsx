import BookCoverArtwork from "../../../components/BookCoverArtwork.tsx";
import {
  AlertTriangle,
  BookOpen,
  Clock3,
  Link2,
} from "lucide-react";
import type { BookshelfBookCard as BookshelfBookCardDto } from "../../../../shared/agent/contracts.ts";

import {
  BOOK_STATUS_LABELS,
  BOOK_STORAGE_LABELS,
  formatCharacterCount,
  formatRelativeTime,
} from "../bookshelfModel.ts";

import BookActionMenu from "./BookActionMenu.tsx";
import type { BookshelfView } from "./BookshelfToolbar.tsx";

type ReadyBook = Extract<BookshelfBookCardDto, { availability: "ready" }>;

export default function BookshelfBookCard({
  book,
  busy,
  onOpen,
  onRead,
  onExport,
  onArchives,
  onTrash,
  menuOpen,
  onMenuToggle,
  onMenuClose,
}: {
  readonly book: BookshelfBookCardDto;
  readonly index: number;
  readonly view: BookshelfView;
  readonly busy: boolean;
  readonly menuOpen: boolean;
  readonly onMenuToggle: () => void;
  readonly onMenuClose: () => void;
  readonly onOpen: (book: ReadyBook) => void;
  readonly onRead: (book: ReadyBook) => void;
  readonly onExport: (book: ReadyBook) => void;
  readonly onArchives: (book: ReadyBook) => void;
  readonly onTrash: (book: ReadyBook) => void;
}) {

  if (book.availability === "unavailable") {
    return <article className="shelf-card shelf-card-unavailable">
      <div className="grid place-items-center bg-amber-50 text-amber-700"><AlertTriangle size={28} /></div>
      <div className="shelf-card-content">
        <span className="text-[13px] leading-5 text-amber-800">{BOOK_STORAGE_LABELS[book.storageState]}</span>
        <strong className="shelf-card-title">无法读取的书籍</strong>
        <code title={book.bookId}>{book.bookId}</code>
        <p title={book.reason}>{book.reason}</p>
      </div>
    </article>;
  }

  return <article className="shelf-card">
    <div className="shelf-card-heading">
      <div className="shelf-card-status">
        <span className="shelf-status-badge" data-status={book.status}>{BOOK_STATUS_LABELS[book.status]}</span>
        <span className={book.linkedProjectId ? "shelf-linked" : "shelf-unlinked"}><Link2 size={13} aria-hidden="true" />{book.linkedProjectId ? "已关联" : "待创建项目"}</span>
      </div>
      <BookActionMenu title={book.title} bookId={book.bookId} linked={book.linkedProjectId !== null} busy={busy}
        open={menuOpen} onToggle={onMenuToggle} onClose={onMenuClose}
        onExport={() => onExport(book)} onArchives={() => onArchives(book)} onTrash={() => onTrash(book)} />
    </div>
    <div className="shelf-card-body">
      <button className="shelf-cover-button" type="button" aria-label={`打开《${book.title}》`} disabled={busy} onClick={() => onOpen(book)}><div className="shelf-cover"><BookCoverArtwork bookId={book.bookId} title={book.title} /></div></button>
      <div className="shelf-card-content">
        <button className="shelf-card-main" type="button" disabled={busy} onClick={() => onOpen(book)} aria-label={`打开《${book.title}》的写作工作区`}>
          <strong className="shelf-card-title" title={book.title}>{book.title}</strong>
          <span className="shelf-card-description">{book.synopsis || "这个故事还没有简介。"}</span>
        </button>
        <time className="shelf-card-updated" dateTime={book.updatedAt} title={new Date(book.updatedAt).toLocaleString("zh-CN")}><Clock3 size={13} aria-hidden="true" />{formatRelativeTime(book.updatedAt)}更新</time>
      </div>
    </div>
    <footer className="shelf-card-footer">
      <span className="shelf-card-stats"><span><b>{book.chapterCount}</b> 章</span><span className="shelf-stats-divider" aria-hidden="true" /><span><b>{formatCharacterCount(book.characterCount)}</b> 字</span></span>
      <button className="shelf-read" type="button" data-reader-entry={`card-${book.bookId}`} disabled={busy} onClick={() => onRead(book)}><BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />3D 阅读</button>
    </footer>
  </article>;
}
