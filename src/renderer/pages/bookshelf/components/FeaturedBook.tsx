import BookCoverArtwork from "../../../components/BookCoverArtwork.tsx";
import { ArrowRight, Clock3 } from "lucide-react";
import type { BookshelfBookCard } from "../../../../shared/agent/contracts.ts";
import { formatCharacterCount } from "../bookshelfModel.ts";

type ReadyBook = Extract<BookshelfBookCard, { availability: "ready" }>;

export default function FeaturedBook({
  book,
  busy,
  onOpen,
  onRead,
}: {
  readonly book: ReadyBook;
  readonly busy: boolean;
  readonly onOpen: (book: ReadyBook) => void;
  readonly onRead: (book: ReadyBook) => void;
}) {
  return (
    <section className="relative grid min-h-[238px] overflow-hidden rounded-[22px] border border-neutral-900 bg-[#222220] text-white shadow-[0_18px_44px_rgba(27,25,20,.13)] md:grid-cols-[minmax(0,1fr)_300px]" aria-label="最近写作">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(142,113,89,.25),transparent_28%),linear-gradient(115deg,transparent_54%,rgba(255,255,255,.025)_54%)]" />
      <div className="relative z-10 flex flex-col items-start px-6 py-7 sm:px-9 sm:py-8">
        <span className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.09em] text-stone-300"><Clock3 size={18} />最近写作</span>
        <h2 className="mb-2 mt-4 font-serif text-[28px] font-semibold leading-[1.3] tracking-[0.01em]">《{book.title}》</h2>
        <p className="m-0 max-w-lg font-serif text-[14px] leading-7 text-stone-300">{book.synopsis || "这个故事还没有简介。"}</p>
        <div className="mt-4 flex items-center gap-6 text-[13px] text-stone-300">
          <span><b className="mr-1 text-base text-stone-200">{book.chapterCount}</b>章节</span>
          <span><b className="mr-1 text-base text-stone-200">{formatCharacterCount(book.characterCount)}</b>字</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white px-4 text-[14px] font-semibold text-neutral-900 transition hover:-translate-y-0.5 hover:bg-stone-100 disabled:opacity-60" type="button" disabled={busy} onClick={() => onOpen(book)}>继续写作 <ArrowRight size={18} /></button>
          <button className="flex h-10 items-center gap-2 rounded-xl border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white hover:bg-white/10 disabled:opacity-60" type="button" data-reader-entry={`featured-${book.bookId}`} disabled={busy} onClick={() => onRead(book)}>3D 阅读 <ArrowRight size={18} /></button>
        </div>
      </div>
      <div className="relative hidden min-h-[238px] overflow-hidden md:block" aria-hidden="true">
        <span className="absolute bottom-3 right-[8%] h-10 w-52 -rotate-6 rounded-full bg-black/60 blur-2xl" />
        <div className="absolute -top-3 right-[15%] flex h-[230px] w-40 rotate-[7deg] flex-col overflow-hidden rounded-r-xl border border-white/15 bg-[linear-gradient(155deg,#4b413b,#181918_67%,#7e5232_160%)] shadow-[-14px_20px_30px_rgba(0,0,0,.36),inset_8px_0_rgba(255,255,255,.035)]">
          <BookCoverArtwork bookId={book.bookId} title={book.title} />
        </div>
      </div>
    </section>
  );
}
