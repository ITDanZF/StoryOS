import { describe, expect, it } from "vitest";
import type { ChapterGenerationView } from "../../agent/types.ts";
import { resolveChapterGenerationPreviewContent } from "./useChapterGenerationPreview.ts";

const generating: ChapterGenerationView = {
  generationId: "generation-1",
  projectId: "project-1",
  chapterId: "chapter-1",
  mode: "append",
  status: "generating",
  thinkingText: "正在安排场景节奏",
  publishedPageCount: 1,
  generatedCharacterCount: 800,
  previewContent: "page-content",
  updatedAt: new Date(0).toISOString(),
};

describe("chapter generation page preview", () => {
  it("publishes the latest complete page batch while generation continues", () => {
    expect(resolveChapterGenerationPreviewContent(generating, null)).toBe("page-content");
  });

  it("keeps the preview until loaded canonical content matches the saved revision", () => {
    const completed: ChapterGenerationView = {
      ...generating,
      status: "completed",
      revisionNumber: 2,
    };
    expect(resolveChapterGenerationPreviewContent(completed, 2, "stale-body")).toBe(
      "page-content",
    );
    expect(resolveChapterGenerationPreviewContent(completed, 2, "page-content")).toBeNull();
  });

  it("removes unfinished preview content after failure", () => {
    expect(resolveChapterGenerationPreviewContent({
      ...generating,
      status: "failed",
      error: "failed",
    }, null)).toBeNull();
  });
});
