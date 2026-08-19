import type { Editor } from "@tiptap/core";
import { getSchema } from "@tiptap/core";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import StarterKitExtension from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import PageBreakExtension from "../editor/PageBreakExtension.ts";
import {
  deleteChapterPage,
  moveChapterPage,
} from "./pageEditorCommands.ts";
import type { ChapterPaginationSnapshot } from "./paginationModel.ts";

const schema = getSchema([StarterKitExtension, PageBreakExtension]);

function createEditor(content: readonly Record<string, unknown>[] = [
  "A",
  "B",
  "C",
].map((text) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
}))): {
  readonly editor: Editor;
  readonly getDocument: () => EditorState["doc"];
} {
  let state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON({
      type: "doc",
      content,
    }),
  });
  const editor = {
    get state() {
      return state;
    },
    view: {
      dispatch(transaction: Transaction) {
        state = state.apply(transaction);
      },
    },
  } as unknown as Editor;
  return { editor, getDocument: () => state.doc };
}

const snapshot: ChapterPaginationSnapshot = {
  generation: 1,
  layoutKey: "move-test",
  status: "ready",
  pages: [
    { index: 0, from: 1, to: 4, usedHeight: 10, breakReason: "automatic", overflow: false },
    { index: 1, from: 4, to: 7, usedHeight: 10, breakReason: "automatic", overflow: false },
    { index: 2, from: 7, to: 8, usedHeight: 10, breakReason: "document-end", overflow: false },
  ],
};

describe("page editor commands", () => {
  it("moves the last page to the first page without leaving empty blocks", () => {
    const { editor, getDocument } = createEditor();

    expect(moveChapterPage(editor, snapshot, 3, 1)).toBe(true);
    expect(getDocument().toJSON()).toEqual({
      type: "doc",
      content: ["C", "A", "B"].map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    });
  });

  it("moves an earlier page after the target page", () => {
    const { editor, getDocument } = createEditor();

    expect(moveChapterPage(editor, snapshot, 1, 2)).toBe(true);
    expect(getDocument().textContent).toBe("BAC");
  });

  it("deletes an automatically paginated page as complete blocks", () => {
    const { editor, getDocument } = createEditor();

    expect(deleteChapterPage(editor, snapshot, 2)).toBe(true);
    expect(getDocument().textContent).toBe("AC");
    expect(getDocument().childCount).toBe(2);
  });

  it("removes the preceding manual page break with the deleted page", () => {
    const { editor, getDocument } = createEditor([
      { type: "paragraph", content: [{ type: "text", text: "A" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "B" }] },
    ]);
    const manualSnapshot: ChapterPaginationSnapshot = {
      generation: 1,
      layoutKey: "manual-delete-test",
      status: "ready",
      pages: [
        { index: 0, from: 1, to: 3, usedHeight: 10, breakReason: "manual", overflow: false },
        { index: 1, from: 4, to: 6, usedHeight: 10, breakReason: "document-end", overflow: false },
      ],
    };

    expect(deleteChapterPage(editor, manualSnapshot, 2)).toBe(true);
    expect(getDocument().textContent).toBe("A");
    expect(getDocument().toJSON()).toEqual({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "A" }],
      }],
    });
  });

  it("keeps a valid empty document when its only page is deleted", () => {
    const { editor, getDocument } = createEditor([
      { type: "paragraph", content: [{ type: "text", text: "A" }] },
    ]);
    const singlePageSnapshot: ChapterPaginationSnapshot = {
      generation: 1,
      layoutKey: "single-delete-test",
      status: "ready",
      pages: [{
        index: 0,
        from: 1,
        to: 2,
        usedHeight: 10,
        breakReason: "document-end",
        overflow: false,
      }],
    };

    expect(deleteChapterPage(editor, singlePageSnapshot, 1)).toBe(true);
    expect(getDocument().toJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});
