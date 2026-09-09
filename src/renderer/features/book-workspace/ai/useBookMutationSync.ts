import { useEffect } from "react";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

type UseBookMutationSyncOptions = {
  readonly projectId: string | undefined;
  readonly changeVersion: number;
  readonly reloadWorkspace: () => Promise<unknown>;
  readonly reloadNavigation: (projectId: string) => Promise<unknown>;
};

export default function useBookMutationSync({
  projectId,
  changeVersion,
  reloadWorkspace,
  reloadNavigation,
}: UseBookMutationSyncOptions): void {
  useEffect(() => {
    if (!projectId || changeVersion === 0) return;

    let disposed = false;
    let retryTimer: number | null = null;
    const synchronize = async (attempt: number): Promise<void> => {
      try {
        await Promise.all([
          reloadWorkspace(),
          reloadNavigation(projectId),
        ]);
      } catch {
        if (disposed || attempt >= MAX_ATTEMPTS) return;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          void synchronize(attempt + 1);
        }, RETRY_DELAY_MS * attempt);
      }
    };

    void synchronize(1);
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [changeVersion, projectId, reloadNavigation, reloadWorkspace]);
}
