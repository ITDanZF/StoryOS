import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProjectArchiveSummary,
  RestoreProjectArchiveDesktopRequest,
  RestoreProjectArchiveResult,
} from "../../../../shared/agent/contracts.ts";

type ArchivePhase = "loading" | "ready" | "error";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function useBookProjectArchives(bookId: string) {
  const [phase, setPhase] = useState<ArchivePhase>("loading");
  const [archives, setArchives] = useState<readonly ProjectArchiveSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoringArchiveId, setRestoringArchiveId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPhase("loading");
    setLoadError(null);
    try {
      const result = await window.storyOSAgent.getBookProjectArchives(bookId);
      if (requestId !== requestIdRef.current) return result;
      setArchives(result);
      setPhase("ready");
      return result;
    } catch (error) {
      if (requestId !== requestIdRef.current) return null;
      setLoadError(getErrorMessage(error));
      setPhase("error");
      return null;
    }
  }, [bookId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const restore = useCallback(async (
    request: RestoreProjectArchiveDesktopRequest,
  ): Promise<RestoreProjectArchiveResult | null> => {
    if (restoringArchiveId) return null;
    setRestoringArchiveId(request.archiveId);
    setActionError(null);
    try {
      const response = await window.storyOSAgent.restoreProjectArchive(request);
      return response.result;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return null;
    } finally {
      setRestoringArchiveId(null);
    }
  }, [restoringArchiveId]);

  return {
    phase,
    archives,
    loadError,
    actionError,
    restoringArchiveId,
    load,
    restore,
    clearActionError: () => setActionError(null),
  };
}
