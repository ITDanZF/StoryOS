import { describe, expect, it } from "vitest";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  extractTiptapText,
  parseTiptapDocument,
  serializeTiptapDocument,
} from "../../src/shared/book/richText.ts";

describe("rich text chapter content", () => {
  it("round-trips valid Tiptap JSON and counts visible characters", () => {
    const document = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "雨夜", marks: [{ type: "bold" }] },
          { type: "text", text: " 开始" },
        ],
      }],
    } as const;

    const restored = parseTiptapDocument(
      serializeTiptapDocument(document),
    );
    expect(extractTiptapText(restored)).toBe("雨夜 开始");
    expect(countTiptapCharacters(restored)).toBe(4);
  });

  it("converts stored plain text into Tiptap paragraphs", () => {
    const restored = decodeStoredChapterContent("第一段\n\n第二段");

    expect(restored.type).toBe("doc");
    expect(restored.content).toHaveLength(2);
    expect(extractTiptapText(restored)).toBe("第一段\n第二段");
  });

  it("rejects malformed Tiptap documents", () => {
    expect(() => parseTiptapDocument('{"type":"paragraph"}'))
      .toThrow("root");
    expect(() => parseTiptapDocument('{"type":"doc","content":"bad"}'))
      .toThrow("content");
  });
});

