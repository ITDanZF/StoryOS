import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createChapterEditorExtensions } from "./chapterEditorExtensions.ts";
import { EDITOR_COMMANDS } from "./commands/editorCommandRegistry.ts";
import { findChapterSearchMatches } from "./search/FindReplaceExtension.ts";

const schema = getSchema(createChapterEditorExtensions());

describe("chapter editor foundation", () => {
  it("keeps command shortcuts unique", () => {
    const shortcuts = Object.values(EDITOR_COMMANDS)
      .flatMap((command) => command.shortcut ? [command.shortcut] : []);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("persists paragraph formatting attributes in the document schema", () => {
    const paragraph = schema.nodeFromJSON({
      type: "paragraph",
      attrs: {
        textAlign: "justify",
        lineHeight: "1.5",
        firstLineIndent: "2em",
        indentLeft: "2em",
      },
      content: [{ type: "text", text: "段落" }],
    });
    expect(paragraph.attrs).toMatchObject({
      textAlign: "justify",
      lineHeight: "1.5",
      firstLineIndent: "2em",
      indentLeft: "2em",
    });
  });

  it("finds text across adjacent marks but not across paragraphs", () => {
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "雨", marks: [{ type: "bold" }] },
            { type: "text", text: "夜开始" },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "下一段" }] },
      ],
    });
    expect(findChapterSearchMatches(document, "雨夜")).toHaveLength(1);
    expect(findChapterSearchMatches(document, "开始下一段")).toHaveLength(0);
  });
});
