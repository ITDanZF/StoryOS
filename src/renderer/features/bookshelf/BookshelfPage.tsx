import { PageSurface, PageHeader } from "../../components/layout/PageSurface.tsx";
import useBookshelfView from "./useBookshelfView.ts";
import { Toast } from "../../components/ui/Notice.tsx";
import { hasOpenDialog, isEditableTarget } from "../../lib/keyboard.ts";
import { startReaderEntry } from "../reader/ReaderEntryLayer.tsx";
import {
  BookOpen,
  LibraryBig,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookshelfBookCard } from "../../../shared/agent/contracts.ts";
import { cn } from "../../../lib/utils.ts";
import CreateProjectDialog from "../project/components/CreateProjectDialog.tsx";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import BookshelfBookCardView from "./components/BookshelfBookCard.tsx";
import BookshelfToolbar from "./components/BookshelfToolbar.tsx";
import FeaturedBook from "./components/FeaturedBook.tsx";
import NewBookDialog from "./components/NewBookDialog.tsx";
import {
  calculateBookshelfTotals,
  filterBooks,
  formatCharacterCount,
  selectFeaturedBook,
} from "./bookshelfModel.ts";
import useBookshelf from "./useBookshelf.ts";
import BookArchivesDialog from "./archives/BookArchivesDialog.tsx";
import useBookshelfTrash from "./trash/useBookshelfTrash.ts";
import ImportBookDialog from "./transfer/ImportBookDialog.tsx";
import ExportBookDialog from "./transfer/ExportBookDialog.tsx";

import "./bookshelf.css";


type ReadyBook = Extract<BookshelfBookCard, { availability: "ready" }>;


export default function BookshelfPage() {
  const {
    state,
    openSidebar,
    createProject,
    switchProject,
  } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const bookshelf = useBookshelf();
  const trash = useBookshelfTrash();
  const { view, setView, query, setQuery, shelfScrollRef, rememberReaderReturn } = useBookshelfView(bookshelf.phase);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<ReadyBook | null>(null);
  const [projectTargetBookId, setProjectTargetBookId] = useState<string | null>(null);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ReadyBook | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [menuBookId, setMenuBookId] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuBookId(null), []);
  useEffect(closeMenu, [query, view, closeMenu]);

  const openReader = (book: ReadyBook) => {
    rememberReaderReturn(book.bookId);
    startReaderEntry(book, navigate);
  };


  const readyBooks = bookshelf.books.filter(
    (book): book is ReadyBook => book.availability === "ready",
  );
  const visibleBooks = useMemo(
    () => filterBooks(bookshelf.books, query),
    [bookshelf.books, query],
  );
  const featuredBook = useMemo(
    () => selectFeaturedBook(bookshelf.books),
    [bookshelf.books],
  );
  const totals = useMemo(
    () => calculateBookshelfTotals(bookshelf.books),
    [bookshelf.books],
  );
  const projectTarget = projectTargetBookId
    ? readyBooks.find((book) => book.bookId === projectTargetBookId) ?? null
    : null;
  const busy = bookshelf.pendingAction !== null || trash.pendingAction !== null || openingBookId !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || hasOpenDialog() || isEditableTarget(event.target)) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openBook = async (book: ReadyBook) => {
    setPageError(null);
    if (!book.linkedProjectId) {
      setProjectTargetBookId(book.bookId);
      return;
    }
    const project = state.projects?.projects.find(
      (candidate) => candidate.id === book.linkedProjectId,
    );
    if (!project) {
      setPageError("书籍关联的项目已不存在，请重新启动应用后再试。");
      return;
    }
    setOpeningBookId(book.bookId);
    try {
      if (state.projects?.activeProjectId !== project.id) {
        await switchProject(project.path);
      }
      navigate(`/projects/${project.id}/book`);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningBookId(null);
    }
  };

  const createProjectForBook = async (
    book: ReadyBook,
    name: string,
    parentPath: string,
  ) => {
    setPageError(null);
    setOpeningBookId(book.bookId);
    try {
      const snapshot = await createProject({
        name,
        parentPath,
        createAgentsFile: false,
        bookId: book.bookId,
      });
      const project = snapshot.projects.activeProject;
      if (!project) throw new Error("项目创建成功，但没有活动项目。");
      return () => navigate(`/projects/${project.id}/book`);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setOpeningBookId(null);
    }
  };

  const moveBookToTrash = async (book: ReadyBook) => {
    setPageError(null);
    bookshelf.clearNotice();
    if (book.linkedProjectId) {
      setPageError("这本书仍关联写作项目，不能移入回收站。请先保留当前项目继续写作，或删除项目完成归档后再回收书籍。");
      return;
    }
    const moved = await trash.moveToTrash(book.bookId);
    if (moved) await bookshelf.load();
  };

  return (
    <PageSurface className="shelf-page bg-surface-canvas" aria-label="我的书架">
      <PageHeader className="shelf-page-header flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-2 backdrop-blur-xl sm:px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <button className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-muted lg:hidden" type="button" aria-label="打开侧栏" onClick={openSidebar}><Menu size={19} /></button>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg"><LibraryBig size={18} /></span>
          <span className="grid min-w-0 gap-0.5">
            <small className="text-[11px] font-semibold tracking-[0.12em] text-text-secondary">STORY LIBRARY</small>
            <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground">我的书架</h1>
            <p className="m-0 hidden truncate text-[13px] text-muted-foreground sm:block">让每一个正在生长的故事，都有清晰的下一步。</p>
          </span>
        </div>

        <div className="shelf-page-actions flex shrink-0 items-center gap-2">
          <button className="relative flex size-10 items-center justify-center gap-2 rounded-xl border border-border bg-card text-[14px] font-semibold text-text-secondary transition hover:border-border-strong hover:bg-surface-subtle sm:w-auto sm:px-3" type="button" aria-label="打开书架回收站" onClick={() => navigate("/bookshelf/trash")}><Trash2 size={18} /><span className="hidden sm:inline">回收站</span>{trash.entries.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[11px] leading-4 text-primary-foreground">{trash.entries.length}</span>}</button>
          <button className="flex size-10 items-center justify-center gap-2 rounded-xl border border-border bg-card text-[14px] font-semibold text-text-secondary transition hover:border-border-strong hover:bg-surface-subtle disabled:opacity-50 sm:w-auto sm:px-3" type="button" aria-label="导入书籍" disabled={busy} onClick={() => setImportOpen(true)}><Upload size={18} /><span className="hidden sm:inline">导入书籍</span></button>
          <button className="flex h-10 items-center gap-2 rounded-xl border border-primary bg-primary px-3 text-[14px] font-semibold text-primary-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-50" type="button" disabled={busy} onClick={() => setNewBookOpen(true)}><Plus size={18} />新建书籍</button>
        </div>
      </PageHeader>

      <div ref={shelfScrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="书架内容">
        <div className="shelf-content">
          {bookshelf.phase === "loading" && bookshelf.books.length === 0 ? (
            <div className="grid gap-4" aria-label="正在加载书架">
              <div className="h-[238px] animate-pulse rounded-[22px] bg-border" />
              <div className="shelf-grid">{[0, 1, 2].map((item) => <div className="min-h-[272px] animate-pulse rounded-2xl bg-border" key={item} />)}</div>
            </div>
          ) : bookshelf.phase === "error" ? (
            <div className="grid place-items-center rounded-2xl border border-danger-border bg-card px-6 py-16 text-center">
              <strong className="text-sm text-foreground">书架加载失败</strong>
              <p className="mb-4 mt-2 max-w-lg text-[13px] leading-5 text-danger-text">{bookshelf.loadError}</p>
              <button className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-semibold hover:bg-surface-subtle" type="button" onClick={() => void bookshelf.load()}><RefreshCw size={13} />重新加载</button>
            </div>
          ) : bookshelf.books.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border-strong bg-card px-6 py-20 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground"><BookOpen size={20} /></span>
              <strong className="mt-4 text-sm text-foreground">书架还是空的</strong>
              <p className="mb-5 mt-2 text-[13px] text-text-secondary">新建第一本书，或导入已有的 StoryOS 书籍。</p>
              <div className="flex gap-2">
                <button className="h-10 rounded-xl border border-border bg-card px-4 text-[14px] font-semibold hover:bg-surface-subtle" type="button" onClick={() => setImportOpen(true)}>导入书籍</button>
                <button className="h-10 rounded-xl border border-primary bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover" type="button" onClick={() => setNewBookOpen(true)}>新建书籍</button>
              </div>
            </div>
          ) : (
            <>
              {featuredBook && <FeaturedBook book={featuredBook} busy={busy} onOpen={(book) => void openBook(book)} onRead={openReader} />}

              <section className={cn(featuredBook ? "mt-8" : "mt-1")} aria-labelledby="all-books-title">
                <div className="shelf-section-heading mb-4 flex items-end justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-semibold tracking-[0.12em] text-text-secondary">ALL STORIES</span>
                    <h2 className="mb-0 mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight" id="all-books-title">全部作品 <small className="rounded-full bg-border px-2 py-0.5 text-[13px] font-semibold text-text-secondary">{bookshelf.books.length}</small></h2>
                  </div>
                  <p className="m-0 pb-0.5 text-[13px] text-muted-foreground">{totals.chapters} 章 · {formatCharacterCount(totals.characters)} 字</p>
                </div>

                <BookshelfToolbar query={query} view={view} searchInputRef={searchInputRef} onQueryChange={setQuery} onViewChange={setView} />

                {visibleBooks.length > 0 ? (
                  <div className={cn("shelf-grid", view === "list" && "shelf-list")}>
                    {visibleBooks.map((book, index) => (
                      <BookshelfBookCardView book={book} index={index} view={view} busy={busy} menuOpen={menuBookId === book.bookId} onMenuToggle={() => setMenuBookId(id => id === book.bookId ? null : book.bookId)} onMenuClose={closeMenu} onOpen={(readyBook) => void openBook(readyBook)} onRead={openReader} onExport={setExportTarget} onArchives={setArchiveTarget} onTrash={(readyBook) => void moveBookToTrash(readyBook)} key={book.bookId} />
                    ))}
                  </div>
                ) : (
                  <div className="grid place-items-center rounded-2xl border border-dashed border-border-strong px-5 py-14 text-center">
                    <span className="grid size-11 place-items-center rounded-xl bg-border text-text-secondary"><Search size={18} /></span>
                    <strong className="mt-3 text-base text-text-secondary">没有找到相关作品</strong>
                    <p className="mb-3 mt-1 text-[14px] text-muted-foreground">换一个关键词再试一次。</p>
                    <button className="text-[14px] font-semibold text-text-secondary underline underline-offset-4" type="button" onClick={() => setQuery("")}>清除搜索</button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {!newBookOpen && !projectTarget && (bookshelf.actionError || trash.actionError || pageError) && <Toast tone="danger" onDismiss={() => { setPageError(null); bookshelf.clearActionError(); trash.clearActionError(); }}>{pageError ?? bookshelf.actionError ?? trash.actionError}</Toast>}
      {(bookshelf.notice || trash.notice) && !bookshelf.actionError && !trash.actionError && !pageError && <Toast tone="success" onDismiss={() => { bookshelf.clearNotice(); trash.clearNotice(); }}>{bookshelf.notice ?? trash.notice}</Toast>}

      {archiveTarget && <BookArchivesDialog book={archiveTarget} onClose={() => setArchiveTarget(null)} />}

      {importOpen && <ImportBookDialog onClose={() => setImportOpen(false)} onImported={async () => { await bookshelf.load(); }} />}

      {exportTarget && <ExportBookDialog book={exportTarget} onClose={() => setExportTarget(null)} />}

      {newBookOpen && (
        <NewBookDialog
          busy={bookshelf.pendingAction?.kind === "create"}
          onClose={() => setNewBookOpen(false)}
          onCreate={async (input) => {
            const result = await bookshelf.createBook(input);
            return () => setProjectTargetBookId(result.bookId);
          }}
        />
      )}

      {projectTarget && state.projects && (
        <CreateProjectDialog
          defaultParentPath={state.projects.creationDefaults.parentPath}
          defaultName={projectTarget.title}
          title={`为《${projectTarget.title}》创建写作项目`}
          description="项目保存对话、Agent 运行和工作文件；书籍正文仍保存在独立书库中。"
          confirmLabel="创建并打开"
          onClose={() => setProjectTargetBookId(null)}
          onCreate={({ name, parentPath }) => createProjectForBook(projectTarget, name, parentPath)}
        />
      )}
    </PageSurface>
  );
}
