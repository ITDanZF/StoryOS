import { describe, expect, it } from "vitest";
import type { AgentTurnInput } from "../../../shared/contracts/conversations/applicationContracts.ts";
import {
  BOOK_EDITOR_PAGE_EXCERPT_MAX_CHARS,
  clipBookEditorExcerpt,
} from "../../../shared/contracts/conversations/conversationTurnContext.ts";
import PromptCompiler from "./StoryPromptCompiler.ts";

function turn({
  content,
  ...context
}: Partial<NonNullable<AgentTurnInput["context"]>> & { content?: string }): AgentTurnInput {
  return {
    message: { messageId: "m1", content: content ?? "检查节奏" },
    context: {
      kind: "book_editor",
      projectId: "project-1",
      projectName: "测试项目",
      book: { id: "book-1", title: "示例" },
      chapter: null,
      ...context,
    },
  };
}

describe("StoryPromptCompiler", () => {
  const compiler = new PromptCompiler();

  it("does not embed a full chapter when only identity is present", () => {
    const prompt = compiler.compile(
      turn({
        chapter: {
          id: "ch-1",
          title: "开篇",
          number: 1,
          volumeTitle: "第一卷",
          revisionId: "rev-1",
          revisionNumber: 3,
          pageNumber: 2,
          pageExcerpt: null,
          selection: null,
        },
      }),
    );
    expect(prompt).toContain("当前页摘录：无");
    expect(prompt).toContain("read_book_chapter");
    expect(prompt).not.toContain("<chapter_text>");
  });

  it("embeds only the current page excerpt and declares the budget", () => {
    const prompt = compiler.compile(
      turn({
        chapter: {
          id: "ch-1",
          title: "开篇",
          number: 1,
          volumeTitle: "第一卷",
          revisionId: "rev-1",
          revisionNumber: 3,
          pageNumber: 2,
          pageExcerpt: "这一页的正文",
          selection: { from: 1, to: 4, text: "一页" },
        },
      }),
    );
    expect(prompt).toContain("<page_excerpt>");
    expect(prompt).toContain("这一页的正文");
    expect(prompt).toContain(String(BOOK_EDITOR_PAGE_EXCERPT_MAX_CHARS));
    expect(prompt).toContain("<selection>");
    expect(prompt).not.toContain("<chapter_text>");
  });

  it("clips excerpts to the confirmed budget without substituting another source", () => {
    const clipped = clipBookEditorExcerpt("abcde", 3);
    expect(clipped).toBe("abc");
    expect(clipBookEditorExcerpt("ab", 3)).toBe("ab");
  });
});
