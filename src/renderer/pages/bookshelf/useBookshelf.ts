import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BookshelfBookCard,
  CreateBookshelfBookRequest,
  CreateBookshelfBookResult,
} from "../../../shared/agent/contracts.ts";
import { createSafeBookFileName } from "./bookshelfModel.ts";
import BookshelfRefreshScheduler from "./bookshelfRefreshScheduler.ts";

type BookshelfPhase = "loading" | "ready" | "error";
type PendingAction =
  | { readonly kind: "create" }
  | { readonly kind: "import" }
  | { readonly kind: "export"; readonly bookId: string }
  | null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function useBookshelf() {
  const [phase, setPhase] = useState<BookshelfPhase>("loading");
  const [books, setBooks] = useState<readonly BookshelfBookCard[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPhase("loading");
    setLoadError(null);
    try {
      const result = await window.storyOSAgent.getBookshelfBooks();
      if (requestId !== requestIdRef.current) return result;
      setBooks(result);
      setPhase("ready");
      return result;
    } catch (error) {
      if (requestId !== requestIdRef.current) return null;
      setLoadError(getErrorMessage(error));
      setPhase("error");
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const scheduler = new BookshelfRefreshScheduler(load);
    const unsubscribe = window.storyOSAgent.onEvent((event) => {
      if (event.type === "book_changed") scheduler.schedule();
    });
    return () => {
      unsubscribe();
      scheduler.dispose();
    };
  }, [load]);

  const createBook = useCallback(async (
    input: CreateBookshelfBookRequest,
  ): Promise<CreateBookshelfBookResult> => {
    if (pendingAction) throw new Error("另一项书架操作正在进行。");
    setPendingAction({ kind: "create" });
    setActionError(null);
    setNotice(null);
    try {
      const result = await window.storyOSAgent.createBookshelfBook(input);
      await load();
      setNotice(`《${result.book.title}》已加入书架`);
      return result;
    } catch (error) {
      setActionError(getErrorMessage(error));
      throw error;
    } finally {
      setPendingAction(null);
    }
  }, [load, pendingAction]);

  const importBook = useCallback(async () => {
    if (pendingAction) return null;
    const packagePath = await window.storyOSWindow.pickFile({
      title: "导入 StoryOS 书籍",
      filters: [{ name: "StoryOS 书籍", extensions: ["storyos-book"] }],
    });
    if (!packagePath) return null;
    setPendingAction({ kind: "import" });
    setActionError(null);
    setNotice(null);
    try {
      const result = await window.storyOSAgent.importBookshelfBook({ packagePath });
      await load();
      setNotice(`《${result.title}》已导入`);
      return result;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return null;
    } finally {
      setPendingAction(null);
    }
  }, [load, pendingAction]);

  const exportBook = useCallback(async (
    book: Extract<BookshelfBookCard, { availability: "ready" }>,
  ) => {
    if (pendingAction) return false;
    const outputPath = await window.storyOSWindow.saveFile({
      title: `导出《${book.title}》`,
      defaultPath: createSafeBookFileName(book.title),
      filters: [{ name: "StoryOS 书籍", extensions: ["storyos-book"] }],
    });
    if (!outputPath) return false;
    setPendingAction({ kind: "export", bookId: book.bookId });
    setActionError(null);
    setNotice(null);
    try {
      await window.storyOSAgent.exportBookshelfBook({
        bookId: book.bookId,
        outputPath,
      });
      setNotice(`《${book.title}》已导出`);
      return true;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction]);

  return {
    phase,
    books,
    loadError,
    actionError,
    notice,
    pendingAction,
    load,
    createBook,
    importBook,
    exportBook,
    clearActionError: () => setActionError(null),
    clearNotice: () => setNotice(null),
  };
}
