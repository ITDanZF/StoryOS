import { tool } from "langchain";
import { z } from "zod";
import {
  countTiptapCharacters,
  decodeStoredChapterContent,
  extractTiptapText,
  plainTextToTiptapDocument,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type BookToolContext from "./BookToolContext.ts";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function requireChapterState(context: BookToolContext, chapterId: string) {
  const book = context.requireBook();
  const chapter = context.novels.getChapter(chapterId);
  if (chapter.novelId !== book.id) {
    throw new Error(`Chapter does not belong to the current book: ${chapterId}`);
  }
  const revision = context.novels.getCurrentRevision(chapter.id);
  const document = revision
    ? decodeStoredChapterContent(revision.content)
    : plainTextToTiptapDocument("");
  return {
    chapter,
    revision,
    text: extractTiptapText(document),
  };
}

function assertExpectedRevision(
  actual: number | null,
  expected: number | null,
  chapterId: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `Chapter revision conflict: ${chapterId} expected revision ${expected ?? "none"}, current ${actual ?? "none"}.`,
    );
  }
}

function collectOccurrences(text: string, query: string): number[] {
  const occurrences: number[] = [];
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(query, from);
    if (index < 0) break;
    occurrences.push(index);
    from = index + Math.max(1, query.length);
  }
  return occurrences;
}

function replaceChapterText(input: {
  readonly currentText: string;
  readonly expectedText: string;
  readonly replacementText: string;
  readonly occurrence?: number;
  readonly replaceAll?: boolean;
}) {
  const occurrences = collectOccurrences(input.currentText, input.expectedText);
  if (occurrences.length === 0) {
    throw new Error("Expected text was not found in the persisted chapter text.");
  }
  if (input.replaceAll) {
    return {
      nextText: input.currentText.split(input.expectedText).join(input.replacementText),
      replacementCount: occurrences.length,
    };
  }
  if (input.occurrence !== undefined) {
    const occurrenceIndex = input.occurrence - 1;
    const from = occurrences[occurrenceIndex];
    if (from === undefined) {
      throw new Error(
        `Requested occurrence ${input.occurrence} does not exist; found ${occurrences.length}.`,
      );
    }
    return {
      nextText: `${input.currentText.slice(0, from)}${input.replacementText}${input.currentText.slice(from + input.expectedText.length)}`,
      replacementCount: 1,
    };
  }
  if (occurrences.length > 1) {
    throw new Error(
      `Expected text is ambiguous; found ${occurrences.length} occurrences. Pass occurrence or replace_all.`,
    );
  }
  const from = occurrences[0];
  return {
    nextText: `${input.currentText.slice(0, from)}${input.replacementText}${input.currentText.slice(from + input.expectedText.length)}`,
    replacementCount: 1,
  };
}

function savePlainTextRevision(context: BookToolContext, input: {
  readonly chapterId: string;
  readonly text: string;
  readonly expectedCurrentRevisionId: string | null;
  readonly changeSummary?: string;
}) {
  const document = plainTextToTiptapDocument(input.text);
  const content = serializeTiptapDocument(document);
  return context.novels.saveRevision({
    chapterId: input.chapterId,
    content,
    characterCount: countTiptapCharacters(document),
    changeSummary: input.changeSummary,
    expectedCurrentRevisionId: input.expectedCurrentRevisionId,
  });
}

export function createBookChapterContentTools(context: BookToolContext) {
  const replaceText = tool(
    async ({
      chapter_id,
      expected_revision_number,
      expected_text,
      replacement_text,
      occurrence,
      replace_all = false,
      change_summary,
    }) => {
      const state = requireChapterState(context, chapter_id);
      assertExpectedRevision(
        state.revision?.revisionNumber ?? null,
        expected_revision_number,
        chapter_id,
      );
      const { nextText, replacementCount } = replaceChapterText({
        currentText: state.text,
        expectedText: expected_text,
        replacementText: replacement_text,
        ...(occurrence === undefined ? {} : { occurrence }),
        replaceAll: replace_all,
      });
      const revision = savePlainTextRevision(context, {
        chapterId: state.chapter.id,
        text: nextText,
        expectedCurrentRevisionId: state.revision?.id ?? null,
        changeSummary: change_summary ?? "AI 保存层文本替换",
      });
      return stringify({
        action: "chapter_text_replaced",
        success: true,
        chapterId: state.chapter.id,
        previousRevisionNumber: state.revision?.revisionNumber ?? null,
        revisionNumber: revision.revisionNumber,
        replacementCount,
        characterCount: revision.characterCount,
        unchanged: revision.id === state.revision?.id,
      });
    },
    {
      name: "replace_book_chapter_text",
      description: [
        "Modify a persisted chapter revision by replacing exact plain text in the saved chapter content, without requiring the live editor to be mounted.",
        "Use this when live editor tools are unavailable, such as AI focus mode. Prefer live editor tools when the chapter editor is visible.",
        "Always call read_book_chapter first and pass its exact revision.revisionNumber as expected_revision_number.",
        "This saves a new plain-text Tiptap revision and may normalize rich-text formatting; do not use it for styling-only changes.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1).describe("Chapter id from get_book_outline or read_book_chapter."),
        expected_revision_number: z.number().int().positive().nullable().describe("The current persisted revision number, or null if the chapter has no revision."),
        expected_text: z.string().min(1).describe("Exact persisted plain text to replace."),
        replacement_text: z.string().describe("Replacement plain text. Use an empty string to delete the expected text."),
        occurrence: z.number().int().positive().optional().describe("1-based occurrence to replace when expected_text appears more than once."),
        replace_all: z.boolean().optional().default(false).describe("Replace every occurrence of expected_text."),
        change_summary: z.string().trim().min(1).max(200).optional(),
      }),
    },
  );

  const rewriteText = tool(
    async ({
      chapter_id,
      expected_revision_number,
      expected_current_text,
      new_text,
      change_summary,
    }) => {
      const state = requireChapterState(context, chapter_id);
      assertExpectedRevision(
        state.revision?.revisionNumber ?? null,
        expected_revision_number,
        chapter_id,
      );
      if (state.text !== expected_current_text) {
        throw new Error("Persisted chapter text does not match expected_current_text.");
      }
      const revision = savePlainTextRevision(context, {
        chapterId: state.chapter.id,
        text: new_text,
        expectedCurrentRevisionId: state.revision?.id ?? null,
        changeSummary: change_summary ?? "AI 保存层全文改写",
      });
      return stringify({
        action: "chapter_text_rewritten",
        success: true,
        chapterId: state.chapter.id,
        previousRevisionNumber: state.revision?.revisionNumber ?? null,
        revisionNumber: revision.revisionNumber,
        characterCount: revision.characterCount,
        unchanged: revision.id === state.revision?.id,
      });
    },
    {
      name: "rewrite_book_chapter_text",
      description: [
        "Rewrite the full persisted plain text of a chapter and save it as a new revision, without requiring the live editor to be mounted.",
        "Do not use this for drafting, continuing, or substantially expanding fictional prose; use generate_book_chapter_content so the user receives a live preview.",
        "Use this for AI focus mode or batch saved-content edits. Prefer live editor tools when the chapter editor is visible.",
        "Always call read_book_chapter first, pass its exact text as expected_current_text, and pass its revision.revisionNumber as expected_revision_number.",
        "This saves a plain-text Tiptap revision and may normalize rich-text formatting; do not use it for styling-only changes.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1).describe("Chapter id from get_book_outline or read_book_chapter."),
        expected_revision_number: z.number().int().positive().nullable().describe("The current persisted revision number, or null if the chapter has no revision."),
        expected_current_text: z.string().describe("Exact full persisted plain text returned by read_book_chapter."),
        new_text: z.string().describe("New full plain text to save for the chapter."),
        change_summary: z.string().trim().min(1).max(200).optional(),
      }),
    },
  );

  return [replaceText, rewriteText];
}
