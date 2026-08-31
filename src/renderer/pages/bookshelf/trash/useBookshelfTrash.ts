import { useCallback, useEffect, useRef, useState } from "react";
import type { BookshelfTrashEntry } from "../../../../shared/agent/contracts.ts";

type TrashPhase = "loading" | "ready" | "error";
type TrashPendingAction =
  | { readonly kind: "move"; readonly bookId: string }
  | { readonly kind: "restore"; readonly bookId: string }
  | { readonly kind: "delete"; readonly bookId: string }
  | null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function useBookshelfTrash() {
  const [phase, setPhase] = useState<TrashPhase>("loading");
  const [entries, setEntries] = useState<readonly BookshelfTrashEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<TrashPendingAction>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPhase("loading");
    setLoadError(null);
    try {
      const result = await window.storyOSAgent.getBookshelfTrash();
      if (requestId !== requestIdRef.current) return result;
      setEntries(result);
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

  const moveToTrash = useCallback(async (bookId: string) => {
    if (pendingAction) return false;
    setPendingAction({ kind: "move", bookId });
    setActionError(null);
    setNotice(null);
    try {
      const entry = await window.storyOSAgent.moveBookshelfBookToTrash(bookId);
      setEntries((current) => [
        entry,
        ...current.filter((candidate) => candidate.bookId !== entry.bookId),
      ]);
      setNotice(`《${entry.title}》已移入回收站`);
      return true;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction]);

  const restore = useCallback(async (entry: BookshelfTrashEntry) => {
    if (pendingAction) return false;
    setPendingAction({ kind: "restore", bookId: entry.bookId });
    setActionError(null);
    setNotice(null);
    try {
      const restored = await window.storyOSAgent.restoreBookshelfBookFromTrash(
        entry.bookId,
      );
      setEntries((current) => current.filter(
        (candidate) => candidate.bookId !== entry.bookId,
      ));
      setNotice(restored.availability === "ready"
        ? `《${restored.title}》已恢复到书架`
        : `《${entry.title}》已退出回收站，但书籍存储需要修复`);
      return true;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction]);

  const permanentlyDelete = useCallback(async (entry: BookshelfTrashEntry) => {
    if (pendingAction) return false;
    setPendingAction({ kind: "delete", bookId: entry.bookId });
    setActionError(null);
    setNotice(null);
    try {
      await window.storyOSAgent.permanentlyDeleteBookshelfBook({
        bookId: entry.bookId,
        confirmationBookId: entry.bookId,
      });
      setEntries((current) => current.filter(
        (candidate) => candidate.bookId !== entry.bookId,
      ));
      setNotice(`《${entry.title}》已永久删除`);
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
    entries,
    loadError,
    actionError,
    notice,
    pendingAction,
    load,
    moveToTrash,
    restore,
    permanentlyDelete,
    clearActionError: () => setActionError(null),
    clearNotice: () => setNotice(null),
  };
}
