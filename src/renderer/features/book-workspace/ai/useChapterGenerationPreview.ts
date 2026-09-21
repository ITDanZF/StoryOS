import type { ChapterGenerationView } from "../../agent/types.ts";

type UseChapterGenerationPreviewOptions = {
  readonly generation: ChapterGenerationView | null;
  readonly canonicalRevisionNumber: number | null;
  readonly displayedContent?: string;
};

export function resolveChapterGenerationPreviewContent(
  generation: ChapterGenerationView | null,
  canonicalRevisionNumber: number | null,
  displayedContent?: string,
): string | null {
  if (
    !generation ||
    generation.status === "failed" ||
    generation.status === "cancelled"
  ) return null;
  if (
    generation.status === "completed" &&
    canonicalRevisionNumber === generation.revisionNumber &&
    (displayedContent === undefined ||
      displayedContent === generation.previewContent)
  ) return null;
  return generation.previewContent ?? null;
}

export default function useChapterGenerationPreview({
  generation,
  canonicalRevisionNumber,
  displayedContent,
}: UseChapterGenerationPreviewOptions): string | null {
  return resolveChapterGenerationPreviewContent(
    generation,
    canonicalRevisionNumber,
    displayedContent,
  );
}
