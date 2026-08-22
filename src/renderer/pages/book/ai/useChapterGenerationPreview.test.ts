import { describe, expect, it } from "vitest";
import type { BookWorkspaceSnapshot } from "../../../../shared/agent/contracts.ts";
import { extractTiptapText, parseTiptapDocument } from "../../../../shared/book/richText.ts";
import type { ChapterGenerationView } from "../../../features/agent/types.ts";
import { resolveChapterGenerationPreviewContent } from "./useChapterGenerationPreview.ts";

const streaming: ChapterGenerationView = {
  generationId: "generation-1",
  projectId: "project-1",
  chapterId: "chapter-1",
  mode: "append",
  initialText: "已有正文。",
  generatedText: "新增正文。",
  sequence: 1,
  status: "streaming",
  updatedAt: new Date(0).toISOString(),
};

describe("chapter generation preview", () => {
  it("keeps streaming content outside the canonical workspace snapshot", () => {
    const content = resolveChapterGenerationPreviewContent(streaming, null);
    expect(extractTiptapText(parseTiptapDocument(content ?? "")))
      .toBe("已有正文。\n新增正文。");
  });

  it("drops completed preview after the canonical revision arrives", () => {
    const completed: ChapterGenerationView = {
      ...streaming,
      status: "completed",
      content: "canonical-content",
      revisionNumber: 2,
    };
    const workspace = {
      state: "ready",
      chapters: [{ id: "chapter-1", revisionNumber: 2 }],
    } as unknown as BookWorkspaceSnapshot;
    expect(resolveChapterGenerationPreviewContent(completed, workspace)).toBeNull();
    expect(resolveChapterGenerationPreviewContent(completed, null))
      .toBe("canonical-content");
  });
});
