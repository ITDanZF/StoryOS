import { describe, expect, it } from "vitest";
import { deriveThreadTitle, isUntitledThreadTitle } from "./threadTitle.ts";

describe("thread title", () => {
  it("extracts a concise title from a Chinese request", () => {
    expect(deriveThreadTitle("请帮我检查第五章的节奏，并给出三条修改建议。后面还有补充。"))
      .toBe("检查第五章的节奏，并给出三条修改建议");
  });

  it("removes greetings and truncates long prompts", () => {
    expect(deriveThreadTitle("你好，请你分析这一章的人物动机是否自然以及情节推进是否存在明显问题"))
      .toBe("分析这一章的人物动机是否自然以及情节推进是否存在…");
  });

  it("recognizes only default untitled names", () => {
    expect(isUntitledThreadTitle("新对话")).toBe(true);
    expect(isUntitledThreadTitle("开始新对话")).toBe(true);
    expect(isUntitledThreadTitle("章节节奏分析")).toBe(false);
  });
});
