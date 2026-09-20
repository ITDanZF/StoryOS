import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";
import type { ChapterGenerationView } from "../../agent/types.ts";

export function applyChapterGenerationPreviews(
  chapters: readonly BookWorkspaceChapterDto[],
  generations: Readonly<Record<string, ChapterGenerationView>>,
): readonly BookWorkspaceChapterDto[] {
  return chapters.map((chapter) => {
    const generation = generations[chapter.id];
    if (
      !generation?.previewContent ||
      generation.status === "failed" ||
      generation.status === "cancelled"
    ) {
      return chapter;
    }
    return {
      ...chapter,
      contentLoaded: true,
      content: generation.previewContent,
    };
  });
}
