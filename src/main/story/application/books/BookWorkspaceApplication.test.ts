import { describe, expect, it } from "vitest";
import BookWorkspaceApplication from "./BookWorkspaceApplication.ts";

const content = JSON.stringify({
  schemaVersion: 1,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "正文" }] }],
  },
});

describe("book workspace vector enqueue", () => {
  it("enqueues the book after a committed chapter save and not after a draft save", async () => {
    const enqueued: string[] = [];
    let drafts = 0;
    const chapter = {
      id: "chapter-1",
      novelId: "book-1",
      volumeId: null,
      title: "第一章",
      status: "draft" as const,
      sortOrder: 0,
      currentRevisionId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const novels = {
      getChapter: () => chapter,
      saveRevision: () => ({ id: "revision-1" }),
      saveDraft: () => {
        drafts += 1;
        return null;
      },
      getCurrentRevisionMetadata: () => null,
      getCurrentRevision: () => null,
      getDraft: () => null,
    };
    const application = new BookWorkspaceApplication({
      runtime: {
        resolve: async () => ({ novels }),
      },
      novelVectorIndex: {
        enqueue(bookId: string) {
          enqueued.push(bookId);
        },
      },
    } as ConstructorParameters<typeof BookWorkspaceApplication>[0]);

    await application.saveBookChapterContent({
      projectId: "project-1",
      chapterId: chapter.id,
      content,
      expectedCurrentRevisionId: null,
      expectedRowVersion: 1,
      expectedDraftVersion: 0,
    });
    await application.chapterDraft({
      action: "save",
      projectId: "project-1",
      chapterId: chapter.id,
      baseRevisionId: null,
      expectedDraftVersion: 0,
      content,
    });

    expect(enqueued).toEqual(["book-1"]);
    expect(drafts).toBe(1);
  });
});
