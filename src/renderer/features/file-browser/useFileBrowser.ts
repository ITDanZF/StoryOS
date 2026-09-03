import { useCallback, useEffect, useState } from "react";
import type {
  FileBrowserEntry,
  FileBrowserLocation,
} from "../../../shared/window/contracts.ts";

export default function useFileBrowser(extensions: readonly string[]) {
  const [locations, setLocations] = useState<readonly FileBrowserLocation[]>([]);
  const [directoryPath, setDirectoryPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly FileBrowserEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const readDirectory = useCallback(async (nextPath: string, pushHistory = true) => {
    setLoading(true);
    setError(null);
    try {
      const page = await window.storyOSWindow.listFileBrowserDirectory({
        directoryPath: nextPath,
        extensions,
        query,
        sortBy: "name",
        sortDirection: "asc",
      });
      setDirectoryPath(page.directoryPath);
      setParentPath(page.parentPath);
      setEntries(page.entries);
      if (pushHistory) {
        setHistory((current) => {
          const next = [...current.slice(0, historyIndex + 1), page.directoryPath];
          setHistoryIndex(next.length - 1);
          return next;
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [extensions, historyIndex, query]);

  useEffect(() => {
    let active = true;
    void window.storyOSWindow.getFileBrowserLocations().then((result) => {
      if (!active) return;
      setLocations(result);
      const initial = result.find((location) => location.kind === "documents") ?? result[0];
      if (initial) void readDirectory(initial.absolutePath);
      else setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    });
    return () => { active = false; };
  }, []); // Initial location is intentionally loaded once.

  useEffect(() => {
    if (!directoryPath) return;
    const timeout = window.setTimeout((): void => {
      void readDirectory(directoryPath, false);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const goBack = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const target = history[nextIndex];
    if (!target) return;
    setHistoryIndex(nextIndex);
    void readDirectory(target, false);
  };
  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const target = history[nextIndex];
    if (!target) return;
    setHistoryIndex(nextIndex);
    void readDirectory(target, false);
  };

  return {
    locations,
    directoryPath,
    entries,
    parentPath,
    query,
    loading,
    error,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex >= 0 && historyIndex < history.length - 1,
    setQuery,
    openDirectory: (path: string) => readDirectory(path),
    refresh: () => directoryPath ? readDirectory(directoryPath, false) : Promise.resolve(),
    goBack,
    goForward,
    goUp: () => parentPath ? readDirectory(parentPath) : Promise.resolve(),
  };
}
