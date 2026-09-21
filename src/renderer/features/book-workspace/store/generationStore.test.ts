import { describe, expect, it } from "vitest";
import type { ChapterGenerationEvent } from "../../../../shared/contracts/books/chapterGenerationEvents.ts";
import {
  applyChapterGenerationEvent,
  chapterIdToRevealFromMutation,
  createGenerationStore,
  selectGenerationJob,
} from "./generationStore.ts";

const started: ChapterGenerationEvent = {
  type: "chapter_generation_started",
  generationId: "gen-1",
  projectId: "project-1",
  chapterId: "chapter-13",
  mode: "rewrite",
  timestamp: new Date(0).toISOString(),
};

describe("generationStore", () => {
  it("keeps a job after later page_ready events for the same generation", () => {
    const afterStart = applyChapterGenerationEvent({}, started);
    const afterPage = applyChapterGenerationEvent(afterStart, {
      type: "chapter_generation_page_ready",
      generationId: "gen-1",
      projectId: "project-1",
      chapterId: "chapter-13",
      pageNumber: 2,
      content: "preview-2",
      generatedCharacterCount: 1600,
      timestamp: new Date(1).toISOString(),
    });
    expect(afterPage["chapter-13"]?.previewContent).toBe("preview-2");
    expect(afterPage["chapter-13"]?.publishedPageCount).toBe(2);
  });

  it("ignores page_ready from a different generation id", () => {
    const afterStart = applyChapterGenerationEvent({}, started);
    const ignored = applyChapterGenerationEvent(afterStart, {
      type: "chapter_generation_page_ready",
      generationId: "gen-other",
      projectId: "project-1",
      chapterId: "chapter-13",
      pageNumber: 1,
      content: "stale",
      generatedCharacterCount: 10,
      timestamp: new Date(1).toISOString(),
    });
    expect(ignored["chapter-13"]?.previewContent).toBeUndefined();
  });

  it("selects only the requested chapter job", () => {
    const jobs = applyChapterGenerationEvent({}, started);
    expect(selectGenerationJob(jobs, "chapter-4")).toBeNull();
    expect(selectGenerationJob(jobs, "chapter-13")?.generationId).toBe("gen-1");
  });

  it("records lastStarted only on started events", () => {
    const store = createGenerationStore();
    store.getState().applyEvent(started);
    store.getState().applyEvent({
      type: "chapter_generation_page_ready",
      generationId: "gen-1",
      projectId: "project-1",
      chapterId: "chapter-13",
      pageNumber: 1,
      content: "preview",
      generatedCharacterCount: 800,
      timestamp: new Date(1).toISOString(),
    });
    expect(store.getState().lastStarted).toEqual({
      projectId: "project-1",
      chapterId: "chapter-13",
      generationId: "gen-1",
    });
  });
});

describe("chapterIdToRevealFromMutation", () => {
  const jobs = applyChapterGenerationEvent({}, started);

  it("reveals a newly created chapter", () => {
    expect(chapterIdToRevealFromMutation({
      id: "m1",
      kind: "chapter_created",
      chapterId: "chapter-new",
    }, jobs)).toBe("chapter-new");
  });

  it("does not steal focus while the target chapter is still generating", () => {
    expect(chapterIdToRevealFromMutation({
      id: "m2",
      kind: "chapter_revision_saved",
      chapterId: "chapter-13",
      revisionNumber: 2,
    }, jobs)).toBeNull();
  });

  it("does not steal focus after generation saves its own revision", () => {
    const completed = applyChapterGenerationEvent(jobs, {
      type: "chapter_generation_completed",
      generationId: "gen-1",
      projectId: "project-1",
      chapterId: "chapter-13",
      revisionNumber: 2,
      content: "final",
      characterCount: 1200,
      timestamp: new Date(2).toISOString(),
    });
    expect(chapterIdToRevealFromMutation({
      id: "m3",
      kind: "chapter_revision_saved",
      chapterId: "chapter-13",
      revisionNumber: 2,
    }, completed)).toBeNull();
  });

  it("reveals a later revision after the generation job has completed", () => {
    const completed = applyChapterGenerationEvent(jobs, {
      type: "chapter_generation_completed",
      generationId: "gen-1",
      projectId: "project-1",
      chapterId: "chapter-13",
      revisionNumber: 2,
      content: "final",
      characterCount: 1200,
      timestamp: new Date(2).toISOString(),
    });
    expect(chapterIdToRevealFromMutation({
      id: "m4",
      kind: "chapter_revision_saved",
      chapterId: "chapter-13",
      revisionNumber: 3,
    }, completed)).toBe("chapter-13");
  });

  it("reveals a revision saved without a generation job", () => {
    expect(chapterIdToRevealFromMutation({
      id: "m5",
      kind: "chapter_revision_saved",
      chapterId: "chapter-4",
    }, jobs)).toBe("chapter-4");
  });
});
