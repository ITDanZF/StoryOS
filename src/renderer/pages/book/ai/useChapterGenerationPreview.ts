import { useEffect, useRef } from "react";
import type { BookWorkspaceSnapshot } from "../../../../shared/agent/contracts.ts";
import {
  plainTextToTiptapDocument,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type { ChapterGenerationView } from "../../../features/agent/types.ts";

type UseChapterGenerationPreviewOptions = {
  readonly generation: ChapterGenerationView | null;
  readonly workspace: BookWorkspaceSnapshot | null;
  readonly reloadWorkspace: () => Promise<BookWorkspaceSnapshot | null>;
  readonly openChapter: (chapterId: string, pageNumber: number) => void;
};

function previewText(generation: ChapterGenerationView): string {
  if (generation.mode === "rewrite" || !generation.initialText.trim()) {
    return generation.generatedText;
  }
  if (!generation.generatedText) return generation.initialText;
  return `${generation.initialText.trimEnd()}\n\n${generation.generatedText.trimStart()}`;
}

export function resolveChapterGenerationPreviewContent(
  generation: ChapterGenerationView | null,
  workspace: BookWorkspaceSnapshot | null,
): string | null {
  if (!generation || generation.status === "failed") return null;
  if (generation.status === "completed") {
    const canonical = workspace?.state === "ready"
      ? workspace.chapters.find((chapter) => chapter.id === generation.chapterId)
      : null;
    return canonical?.revisionNumber === generation.revisionNumber
      ? null
      : generation.content ?? null;
  }
  return serializeTiptapDocument(plainTextToTiptapDocument(
    previewText(generation),
  ));
}

export default function useChapterGenerationPreview({
  generation,
  workspace,
  reloadWorkspace,
  openChapter,
}: UseChapterGenerationPreviewOptions): string | null {
  const openedGenerationRef = useRef<string | null>(null);
  const revertedGenerationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!generation) return;
    let disposed = false;
    const ensureOpen = async () => {
      const exists = workspace?.state === "ready" && workspace.chapters.some(
        (chapter) => chapter.id === generation.chapterId,
      );
      if (!exists) {
        const refreshed = await reloadWorkspace();
        if (
          disposed ||
          refreshed?.state !== "ready" ||
          !refreshed.chapters.some((chapter) => chapter.id === generation.chapterId)
        ) return;
      }
      if (openedGenerationRef.current !== generation.generationId) {
        openedGenerationRef.current = generation.generationId;
        openChapter(generation.chapterId, 1);
      }
    };
    void ensureOpen();
    return () => {
      disposed = true;
    };
  }, [generation, openChapter, reloadWorkspace, workspace]);

  useEffect(() => {
    if (!generation || generation.status !== "failed") return;
    if (revertedGenerationRef.current !== generation.generationId) {
      revertedGenerationRef.current = generation.generationId;
      void reloadWorkspace();
    }
  }, [generation, reloadWorkspace]);

  return resolveChapterGenerationPreviewContent(generation, workspace);
}
