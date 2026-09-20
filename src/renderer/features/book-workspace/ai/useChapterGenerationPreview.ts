import type { BookWorkspaceSnapshot } from "../../../../shared/agent/contracts.ts";
import type { ChapterGenerationView } from "../../agent/types.ts";

type UseChapterGenerationPreviewOptions = {
  readonly generation: ChapterGenerationView | null;
  readonly workspace: BookWorkspaceSnapshot | null;
};

export function resolveChapterGenerationPreviewContent(
  generation: ChapterGenerationView | null,
  workspace: BookWorkspaceSnapshot | null,
): string | null {
  if (
    !generation ||
    generation.status === "failed" ||
    generation.status === "cancelled"
  ) return null;
  if (generation.status === "completed") {
    const canonical = workspace?.state === "ready"
      ? workspace.chapters.find((chapter) => chapter.id === generation.chapterId)
      : null;
    if (canonical?.revisionNumber === generation.revisionNumber) return null;
  }
  return generation.previewContent ?? null;
}

export default function useChapterGenerationPreview({
  generation,
  workspace,
}: UseChapterGenerationPreviewOptions): string | null {
  return resolveChapterGenerationPreviewContent(generation, workspace);
}
