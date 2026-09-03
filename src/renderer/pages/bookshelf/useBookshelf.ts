import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BookshelfBookCard,
  CreateBookshelfBookRequest,
  CreateBookshelfBookResult,
} from "../../../shared/agent/contracts.ts";
import BookshelfRefreshScheduler from "./bookshelfRefreshScheduler.ts";

type BookshelfPhase = "loading" | "ready" | "error";
type PendingAction =
  | { readonly kind: "create" }
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

  return {
    phase,
    books,
    loadError,
    actionError,
    notice,
    pendingAction,
    load,
    createBook,
    clearActionError: () => setActionError(null),
    clearNotice: () => setNotice(null),
  };
}
