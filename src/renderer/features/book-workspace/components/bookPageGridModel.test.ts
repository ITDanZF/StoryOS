import { describe, expect, it } from "vitest";
import type { BookWorkspaceChapterDto } from "../../../../shared/agent/contracts.ts";
import type { ChapterGenerationView } from "../../agent/types.ts";
import { applyChapterGenerationPreviews } from "./bookPageGridModel.ts";

const chapter = {
  id: "chapter-1",
  contentLoaded: false,
} as BookWorkspaceChapterDto;

const generation: ChapterGenerationView = {
  generationId: "generation-1",
  projectId: "project-1",
  chapterId: chapter.id,
  mode: "rewrite",
  status: "generating",
  thinkingText: "",
  publishedPageCount: 1,
  generatedCharacterCount: 800,
  previewContent: "page-content",
  updatedAt: new Date(0).toISOString(),
};

describe("book page grid generation previews", () => {
  it("treats a background page-ready preview as loaded page content", () => {
    expect(applyChapterGenerationPreviews([chapter], {
      [chapter.id]: generation,
    })[0]).toMatchObject({
      contentLoaded: true,
      content: "page-content",
    });
  });

  it("does not expose failed generation content as a page", () => {
    expect(applyChapterGenerationPreviews([chapter], {
      [chapter.id]: { ...generation, status: "failed", error: "failed" },
    })[0]).toBe(chapter);
  });
});
