import { useEffect, useState } from "react";
import type { ChapterDraft } from "../../../../shared/book/drafts.ts";
import {
  ChapterSaveSession,
  type ChapterSaveHandlers,
} from "./ChapterSaveSession.ts";

export default function useChapterPersistence(
  content: string,
  revision: string | null,
  draft: ChapterDraft | null | undefined,
  handlers: ChapterSaveHandlers,
) {
  const [session] = useState(
    () => new ChapterSaveSession(content, revision, draft, handlers),
  );
  session.handlers = handlers;
  // Includes unmount writes in the same queue; never race a pending revision write.
  useEffect(
    () => () => {
      void session.flush().catch((): void => undefined);
    },
    [session],
  );
  return session;
}
