import { describe, expect, it } from "vitest";
import type { BookWorkspaceSnapshot } from "../../../../shared/agent/contracts.ts";
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

  it("stops overriding the editor after the saved revision reaches the workspace", () => {
    const completed: ChapterGenerationView = {
      ...generating,
      status: "completed",
      revisionNumber: 2,
    };
    const workspace = {
      state: "ready",
      chapters: [{ id: "chapter-1", revisionNumber: 2 }],
    } as unknown as BookWorkspaceSnapshot;
    expect(resolveChapterGenerationPreviewContent(completed, workspace)).toBeNull();
  });

  it("removes unfinished preview content after failure", () => {
    expect(resolveChapterGenerationPreviewContent({
      ...generating,
      status: "failed",
      error: "failed",
    }, null)).toBeNull();
  });
});
