import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createChapterEditorExtensions } from "../chapterEditorExtensions.ts";
import { findEditorTextMatches } from "./richTextTargeting.ts";
import { buildEditorStyleTransaction } from "./richTextTransactions.ts";

const schema = getSchema(createChapterEditorExtensions());

function createDocument() {
  return schema.nodeFromJSON({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        { type: "text", text: "阿", marks: [{ type: "bold" }] },
        { type: "text", text: "澈看见黑衣人，阿澈转身。" },
      ],
    }],
  });
}

describe("AI rich-text targeting", () => {
  it("finds repeated Chinese text across adjacent mark boundaries", () => {
    const matches = findEditorTextMatches(createDocument(), {
      text: "阿澈",
      caseSensitive: true,
    });

    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.expectedText)).toEqual(["阿澈", "阿澈"]);
    expect(matches[0].preview).toContain("黑衣人");
  });

  it("supports optional case-insensitive literal matching without crossing paragraphs", () => {
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A-Che" }] },
        { type: "paragraph", content: [{ type: "text", text: "a-che" }] },
      ],
    });

    expect(findEditorTextMatches(document, {
      text: "a-che",
      caseSensitive: false,
    })).toHaveLength(2);
    expect(findEditorTextMatches(document, {
      text: "Chea",
      caseSensitive: false,
    })).toHaveLength(0);
  });

  it("applies multiple colors in one prevalidated transaction", () => {
    const state = EditorState.create({ doc: createDocument() });
    const result = buildEditorStyleTransaction(state, [
      {
        selector: {
          kind: "text",
          text: "阿澈",
          caseSensitive: true,
          expectedCount: 2,
          occurrences: { kind: "all" },
        },
        style: { kind: "text_color", value: "#2E86AB" },
      },
      {
        selector: {
          kind: "text",
          text: "黑衣人",
          caseSensitive: true,
          expectedCount: 1,
          occurrences: { kind: "all" },
        },
        style: { kind: "text_color", value: "#C0392B" },
      },
    ]);
    const next = state.apply(result.transaction);
    const coloredText: Array<{ text: string; color: unknown }> = [];
    next.doc.descendants((node) => {
      if (node.isText && node.text) {
        coloredText.push({
          text: node.text,
          color: node.marks.find((mark) => mark.type.name === "textStyle")
            ?.attrs.color,
        });
      }
      return true;
    });

    expect(result.targetCount).toBe(3);
    expect(coloredText.filter((item) => item.color === "#2E86AB")
      .map((item) => item.text).join("")).toContain("阿澈阿澈");
    expect(coloredText.find((item) => item.text.includes("黑衣人"))?.color)
      .toBe("#C0392B");
  });

  it("rejects a stale match plan before creating a partial edit", () => {
    const state = EditorState.create({ doc: createDocument() });

    expect(() => buildEditorStyleTransaction(state, [{
      selector: {
        kind: "text",
        text: "阿澈",
        caseSensitive: true,
        expectedCount: 3,
        occurrences: { kind: "all" },
      },
      style: { kind: "mark", mark: "bold", enabled: true },
    }])).toThrow('expected 3, found 2');
    expect(state.doc.eq(createDocument())).toBe(true);
  });

  it("preserves existing text-style attributes and supports selected occurrences", () => {
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "阿澈",
            marks: [{
              type: "textStyle",
              attrs: { backgroundColor: "#FFF3B0" },
            }],
          },
          { type: "text", text: "与阿澈" },
        ],
      }],
    });
    const state = EditorState.create({ doc: document });
    const result = buildEditorStyleTransaction(state, [{
      selector: {
        kind: "text",
        text: "阿澈",
        caseSensitive: true,
        expectedCount: 2,
        occurrences: { kind: "indices", indices: [0] },
      },
      style: { kind: "text_color", value: "#2E86AB" },
    }]);
    const next = state.apply(result.transaction);
    const firstText = next.doc.firstChild?.firstChild;
    const textStyle = firstText?.marks.find(
      (mark) => mark.type.name === "textStyle",
    );

    expect(result.targetCount).toBe(1);
    expect(textStyle?.attrs).toMatchObject({
      backgroundColor: "#FFF3B0",
      color: "#2E86AB",
    });
    expect(next.doc.textContent).toBe("阿澈与阿澈");
  });
});
