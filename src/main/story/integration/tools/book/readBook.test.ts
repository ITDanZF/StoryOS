import { describe, expect, it } from "vitest";
import BookToolContext from "./BookToolContext.ts";
import { createBookReadTools } from "./readBook.ts";

function createContext(plainText: string) {
  const novels = {
    getProjectBook: () => ({
      id: "book-1",
      title: "示例",
      synopsis: "",
      status: "writing" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    getChapter: () => ({
      id: "ch-1",
      novelId: "book-1",
      volumeId: "vol-1",
      title: "开篇",
      status: "draft" as const,
      sortOrder: 0,
      currentRevisionId: "rev-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    listChapters: () => [] as const,
    getCurrentRevisionMetadata: () => ({
      id: "rev-1",
      chapterId: "ch-1",
      revisionNumber: 1,
      contentHash: "hash",
      characterCount: plainText.length,
      changeSummary: "保存",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    getCurrentRevisionPlainText: () => plainText,
    listVolumes: () => [] as const,
    listChapterSummaries: () => [] as const,
    searchChapterPlainText: () => [
      {
        chapterId: "ch-1",
        chapterTitle: "开篇",
        occurrence: 0,
        snippet: plainText.slice(0, 20),
      },
    ],
  };
  return new BookToolContext("project-1", novels as never);
}

describe("createBookReadTools", () => {
  it("reads persisted plain text without parsing chapter JSON", async () => {
    const tools = createBookReadTools(createContext("字".repeat(9000)));
    const read = tools.find((item) => item.name === "read_book_chapter");
    const result = JSON.parse(String(await read?.invoke({ chapter_id: "ch-1" }))) as {
      text: string;
    };
    expect(result.text).toHaveLength(9000);
  });

  it("searches via the plain-text index instead of loading JSON revisions", async () => {
    const tools = createBookReadTools(createContext("伏笔在这里"));
    const search = tools.find((item) => item.name === "search_book_chapters");
    const result = JSON.parse(String(await search?.invoke({ query: "伏笔" }))) as {
      matches: Array<{ chapterId: string }>;
    };
    expect(result.matches[0]?.chapterId).toBe("ch-1");
  });
});
