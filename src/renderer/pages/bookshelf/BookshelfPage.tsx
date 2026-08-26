import {
  Clock3,
  Grid2X2,
  LibraryBig,
  List,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../../lib/utils.ts";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import {
  getBookshelfTheme,
  type BookshelfThemeDecoration,
  type BookshelfThemeId,
} from "./bookshelfThemes.ts";

type LibraryView = "grid" | "list";

type BookshelfBook = {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly chapters: number;
  readonly characters: number;
  readonly progress: number;
  readonly updatedAt: string;
  readonly description: string;
  readonly coverKicker: string;
  readonly coverNumber: string;
  readonly coverTheme: BookshelfThemeId;
};

const bookshelfBooks = [
  {
    id: "long-night",
    title: "长夜",
    genre: "悬疑 · 长篇小说",
    chapters: 12,
    characters: 38_000,
    progress: 38,
    updatedAt: "刚刚",
    description: "一场持续二十年的雨，和一封不该准时送达的信。",
    coverKicker: "A STORY OF RAIN",
    coverNumber: "01",
    coverTheme: "nocturne",
  },
  {
    id: "silent-stars",
    title: "星海无声",
    genre: "科幻 · 太空歌剧",
    chapters: 8,
    characters: 21_000,
    progress: 24,
    updatedAt: "2 小时前",
    description: "远航舰队在寂静星域发现来自未来的求救信号。",
    coverKicker: "DEEP SPACE",
    coverNumber: "02",
    coverTheme: "cosmos",
  },
  {
    id: "tide-marks",
    title: "潮痕",
    genre: "奇幻 · 中篇小说",
    chapters: 5,
    characters: 7_000,
    progress: 12,
    updatedAt: "昨天",
    description: "每封信都在退潮后出现，而寄信人已经失踪。",
    coverKicker: "LETTERS FROM FOG",
    coverNumber: "03",
    coverTheme: "harbor",
  },
] as const satisfies readonly BookshelfBook[];

function formatCharacters(value: number) {
  return value >= 10_000
    ? `${(value / 10_000).toFixed(1)} 万`
    : value.toLocaleString("zh-CN");
}

function ThemeDecoration({ decoration }: {
  readonly decoration: BookshelfThemeDecoration;
}) {
  if (decoration === "rain") {
    return <span className="absolute inset-0 bg-[repeating-linear-gradient(108deg,transparent_0_18px,rgba(210,220,225,.08)_19px,transparent_20px_32px),radial-gradient(circle_at_72%_33%,rgba(214,155,93,.28),transparent_16%)]" />;
  }
  if (decoration === "orbit") {
    return <span className="absolute left-[18%] top-[18%] size-24 rounded-full border border-white/20 before:absolute before:-inset-x-5 before:inset-y-8 before:-rotate-12 before:rounded-[50%] before:border before:border-white/15 before:content-[''] after:absolute after:right-1 after:top-3 after:size-1.5 after:rounded-full after:bg-white after:shadow-[18px_31px_0_-1px_rgba(255,255,255,.8),-25px_42px_0_-1px_rgba(255,255,255,.7)] after:content-['']" />;
  }
  if (decoration === "fog") {
    return <span className="absolute inset-x-0 top-[26%] h-20 bg-[linear-gradient(165deg,transparent_46%,rgba(218,229,222,.16)_47%_50%,transparent_51%),radial-gradient(ellipse_at_center,rgba(225,235,230,.18),transparent_68%)]" />;
  }
  if (decoration === "fibers") {
    return <span className="absolute inset-0 bg-[repeating-linear-gradient(4deg,transparent_0_9px,rgba(85,62,42,.045)_10px,transparent_11px_17px),radial-gradient(circle_at_72%_28%,rgba(255,255,255,.36),transparent_24%)]" />;
  }
  if (decoration === "canopy") {
    return <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_12%,rgba(179,214,165,.25),transparent_24%),radial-gradient(ellipse_at_82%_40%,rgba(133,175,135,.18),transparent_28%),linear-gradient(120deg,transparent_42%,rgba(213,232,197,.1)_43%_45%,transparent_46%)]" />;
  }
  if (decoration === "embers") {
    return <span className="absolute inset-0 bg-[radial-gradient(circle_at_65%_26%,rgba(255,162,82,.8)_0_1px,transparent_2px),radial-gradient(circle_at_35%_44%,rgba(255,110,55,.7)_0_1px,transparent_2px),radial-gradient(circle_at_78%_63%,rgba(255,190,90,.55)_0_1px,transparent_2px),radial-gradient(ellipse_at_52%_100%,rgba(197,65,32,.3),transparent_52%)]" />;
  }
  if (decoration === "petals") {
    return <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_18%,rgba(255,242,241,.56)_0_3px,transparent_4px),radial-gradient(ellipse_at_42%_34%,rgba(255,229,232,.45)_0_4px,transparent_5px),radial-gradient(ellipse_at_84%_54%,rgba(255,240,242,.38)_0_3px,transparent_4px)]" />;
  }
  if (decoration === "facets") {
    return <span className="absolute inset-0 bg-[linear-gradient(125deg,transparent_22%,rgba(230,250,255,.22)_23%_42%,transparent_43%),linear-gradient(42deg,transparent_48%,rgba(216,245,250,.16)_49%_67%,transparent_68%)]" />;
  }
  if (decoration === "dunes") {
    return <span className="absolute inset-x-0 bottom-[18%] h-24 rounded-[50%_50%_0_0] bg-[radial-gradient(ellipse_at_42%_100%,rgba(255,221,163,.28),transparent_62%),linear-gradient(172deg,transparent_0_45%,rgba(80,45,30,.18)_46%_48%,transparent_49%)]" />;
  }
  return <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_68%_28%,rgba(30,31,29,.28),transparent_18%),radial-gradient(ellipse_at_42%_44%,rgba(40,42,38,.18),transparent_28%),linear-gradient(130deg,transparent_46%,rgba(255,255,255,.24)_47%_53%,transparent_54%)] blur-[.2px]" />;
}

function BookCover({ book, compact = false }: {
  readonly book: BookshelfBook;
  readonly compact?: boolean;
}) {
  const theme = getBookshelfTheme(book.coverTheme);
  return (
    <div
      className={cn(
        "relative flex min-h-52 flex-col overflow-hidden border-r border-black/10 px-4 py-4 text-left",
        compact && "min-h-28 px-3 py-3",
        theme.coverClassName,
        theme.textClassName,
      )}
      aria-hidden="true"
    >
      <span className={cn("relative z-10 text-[7px] tracking-[0.16em]", theme.mutedTextClassName)}>
        {book.coverKicker}
      </span>
      <ThemeDecoration decoration={theme.decoration} />

      <span className="relative z-10 mt-auto grid gap-2">
        <strong className={cn(
          "max-w-[3em] font-serif text-[26px] font-medium leading-tight tracking-[0.12em]",
          compact && "text-lg",
        )}>
          {book.title}
        </strong>
        {!compact && (
          <small className={cn("text-[8px] tracking-[0.08em]", theme.mutedTextClassName)}>
            {book.genre.split(" · ")[0]}小说
          </small>
        )}
      </span>
      {!compact && (
        <b className={cn("absolute bottom-3 right-3 z-10 text-[22px] font-light", theme.numberClassName)}>
          {book.coverNumber}
        </b>
      )}
      <span className={cn("absolute inset-y-0 left-0 w-2 bg-gradient-to-r", theme.spineClassName)} />
    </div>
  );
}

function BookCard({ book, view }: {
  readonly book: BookshelfBook;
  readonly view: LibraryView;
}) {
  const listView = view === "list";
  return (
    <article className={cn(
      "group grid min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_7px_22px_rgba(30,28,20,.045)] transition duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_15px_32px_rgba(30,28,20,.09)]",
      listView ? "grid-cols-[88px_minmax(0,1fr)]" : "grid-cols-[42%_minmax(0,1fr)]",
    )}>
      <button className="border-0 bg-transparent p-0 text-left" type="button" aria-label={`打开《${book.title}》`}>
        <BookCover book={book} compact={listView} />
      </button>

      <div className={cn("relative flex min-w-0 flex-col p-4", listView && "py-3.5")}>
        <button className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" type="button" aria-label={`管理《${book.title}》`}>
          <MoreHorizontal size={15} />
        </button>

        <button className={cn("grid min-w-0 gap-2 border-0 bg-transparent p-0 pr-7 text-left", listView && "gap-1")} type="button">
          <strong className={cn("truncate font-serif text-[17px] font-semibold leading-tight text-neutral-900", listView && "text-[15px]")}>
            {book.title}
          </strong>
          <span className={cn(
            "overflow-hidden font-serif text-[11px] leading-[1.75] text-neutral-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]",
            listView && "[-webkit-line-clamp:1]",
          )}>
            {book.description}
          </span>
        </button>

        <footer className="mt-auto flex items-center gap-1.5 border-t border-neutral-100 pt-3 text-[9px] text-neutral-400">
          <span>{book.chapters} 章</span>
          <i className="size-0.5 rounded-full bg-neutral-300" />
          <span>{formatCharacters(book.characters)} 字</span>
          <time className="ml-auto">{book.updatedAt}</time>
        </footer>
      </div>
    </article>
  );
}

function FeaturedBook({ book }: { readonly book: BookshelfBook }) {
  return (
    <section className="relative grid min-h-[250px] overflow-hidden rounded-[22px] border border-neutral-900 bg-[#222220] text-white shadow-[0_18px_44px_rgba(27,25,20,.13)] md:grid-cols-[minmax(0,1fr)_300px]" aria-label="最近写作">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(142,113,89,.25),transparent_28%),linear-gradient(115deg,transparent_54%,rgba(255,255,255,.025)_54%)]" />
      <div className="relative z-10 flex flex-col items-start px-6 py-7 sm:px-9 sm:py-8">
        <span className="flex items-center gap-2 text-[9px] font-semibold tracking-[0.09em] text-stone-300">
          <Clock3 size={13} />最近写作
        </span>
        <h2 className="mb-2 mt-4 font-serif text-[26px] font-semibold leading-[1.3] tracking-[0.01em] sm:text-[30px]">
          故事停在雨夜，<br />下一页正等你落笔。
        </h2>
        <p className="m-0 max-w-lg font-serif text-[11px] leading-7 text-stone-400">
          {book.description}
        </p>
        <div className="mt-4 flex items-center gap-6 text-[9px] text-stone-500">
          <span><b className="mr-1 text-xs text-stone-200">{book.chapters}</b>章节</span>
          <span><b className="mr-1 text-xs text-stone-200">{formatCharacters(book.characters)}</b>字</span>
          <span><b className="mr-1 text-xs text-stone-200">{book.progress}%</b>进度</span>
        </div>
      </div>

      <div className="relative hidden min-h-[250px] overflow-hidden md:block" aria-hidden="true">
        <span className="absolute bottom-1 right-[8%] h-10 w-52 -rotate-6 rounded-full bg-black/60 blur-2xl" />
        <div className="absolute -top-3 right-[15%] flex h-[245px] w-40 rotate-[7deg] flex-col overflow-hidden rounded-r-xl border border-white/15 bg-[linear-gradient(155deg,#4b413b,#181918_67%,#7e5232_160%)] px-5 py-5 shadow-[-14px_20px_30px_rgba(0,0,0,.36),inset_8px_0_rgba(255,255,255,.035)]">
          <span className="absolute inset-0 bg-[repeating-linear-gradient(105deg,transparent_0_17px,rgba(220,226,230,.06)_18px,transparent_19px_32px)]" />
          <span className="relative text-[6px] tracking-[0.18em] text-stone-300/70">STORYOS ORIGINAL</span>
          <strong className="relative ml-2 mt-7 font-serif text-4xl font-medium leading-tight tracking-[0.2em]">长<br />夜</strong>
          <small className="relative mt-auto text-[6px] tracking-[0.06em] text-stone-300/70">一场持续二十年的雨</small>
          <i className="absolute bottom-6 right-5 h-14 w-px bg-amber-700" />
        </div>
      </div>
    </section>
  );
}

export default function BookshelfPage() {
  const { openSidebar } = useWorkspaceOutlet();
  const [view, setView] = useState<LibraryView>("grid");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const featuredBook = bookshelfBooks[0];
  const totals = bookshelfBooks.reduce(
    (result, book) => ({
      chapters: result.chapters + book.chapters,
      characters: result.characters + book.characters,
    }),
    { chapters: 0, characters: 0 },
  );
  const visibleBooks = useMemo(() => bookshelfBooks.filter((book) => {
    const searchableText = `${book.title} ${book.genre} ${book.description}`.toLocaleLowerCase("zh-CN");
    return !normalizedQuery || searchableText.includes(normalizedQuery);
  }), [normalizedQuery]);

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-[#f5f5f2] sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3" aria-label="我的书架">
      <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-2 backdrop-blur-xl sm:px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <button className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 lg:hidden" type="button" aria-label="打开侧栏" onClick={openSidebar}>
            <Menu size={19} />
          </button>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-900 text-white shadow-lg">
            <LibraryBig size={18} />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <small className="text-[8px] font-semibold tracking-[0.12em] text-stone-400">STORY LIBRARY</small>
            <h1 className="m-0 text-base font-semibold tracking-tight text-neutral-900">我的书架</h1>
            <p className="m-0 hidden truncate text-[9px] text-neutral-400 sm:block">让每一个正在生长的故事，都有清晰的下一步。</p>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button className="hidden h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-[10px] font-semibold text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 sm:flex" type="button">
            <Upload size={14} />导入书籍
          </button>
          <button className="flex h-9 items-center gap-2 rounded-xl border border-neutral-900 bg-neutral-900 px-3 text-[10px] font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-black" type="button">
            <Plus size={14} />新建书籍
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-label="书架内容">
        <div className="mx-auto w-[min(1080px,calc(100%_-_28px))] py-4 sm:w-[min(1080px,calc(100%_-_40px))] sm:py-7">
          <FeaturedBook book={featuredBook} />

          <section className="mt-8" aria-labelledby="all-books-title">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <span className="text-[8px] font-semibold tracking-[0.12em] text-stone-400">ALL STORIES</span>
                <h2 className="mb-0 mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight" id="all-books-title">
                  全部作品
                  <small className="rounded-full bg-neutral-200 px-2 py-0.5 text-[9px] font-semibold text-neutral-500">{bookshelfBooks.length}</small>
                </h2>
              </div>
              <p className="m-0 pb-0.5 text-[9px] text-neutral-400">{totals.chapters} 章 · {formatCharacters(totals.characters)} 字</p>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2.5">
              <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 shadow-sm transition focus-within:border-neutral-400 focus-within:ring-4 focus-within:ring-black/5 md:w-[270px]">
                <Search className="shrink-0 text-neutral-400" size={14} />
                <input className="min-w-0 flex-1 border-0 bg-transparent text-[10px] text-neutral-700 outline-none placeholder:text-neutral-400" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书名或类型" aria-label="搜索书籍" />
                <kbd className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[7px] text-neutral-400">Ctrl F</kbd>
              </label>

              <div className="ml-auto hidden items-center rounded-xl border border-neutral-200 bg-neutral-200/70 p-1 sm:flex" role="group" aria-label="切换展示方式">
                <button className={cn("grid size-7 place-items-center rounded-lg border-0 bg-transparent text-neutral-400", view === "grid" && "bg-white text-neutral-700 shadow-sm")} type="button" aria-label="网格视图" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={14} /></button>
                <button className={cn("grid size-7 place-items-center rounded-lg border-0 bg-transparent text-neutral-400", view === "list" && "bg-white text-neutral-700 shadow-sm")} type="button" aria-label="列表视图" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={14} /></button>
              </div>
            </div>

            {visibleBooks.length > 0 ? (
              <div className={cn("grid gap-4", view === "grid" ? "md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
                {visibleBooks.map((book) => <BookCard book={book} view={view} key={book.id} />)}
              </div>
            ) : (
              <div className="grid place-items-center rounded-2xl border border-dashed border-neutral-300 px-5 py-14 text-center">
                <span className="grid size-11 place-items-center rounded-xl bg-neutral-200 text-neutral-500"><Search size={18} /></span>
                <strong className="mt-3 text-xs text-neutral-700">没有找到相关作品</strong>
                <p className="mb-0 mt-1 text-[10px] text-neutral-400">换一个关键词，再试一次。</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
