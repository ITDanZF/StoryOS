import { tool } from "langchain";
import { z } from "zod";
import type {
  EditorCommandName,
  EditorStyleChange,
  RendererEditorToolClient,
} from "./contracts.ts";
import {
  editorStyleSchema,
  editorTargetSelectorSchema,
  toEditorStyle,
  toEditorTargetSelector,
} from "./editorToolSchemas.ts";

const editorCommandSchema = z.enum([
  "bold",
  "italic",
  "underline",
  "strike",
  "blockquote",
  "bulletList",
  "orderedList",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignJustify",
  "clearFormatting",
  "undo",
  "redo",
]);

export function createEditorTools(
  client: RendererEditorToolClient,
  projectId: string,
) {
  const getContext = tool(
    async () => JSON.stringify(
      await client.invoke(projectId, { kind: "get_context" }),
      null,
      2,
    ),
    {
      name: "get_active_editor_context",
      description: "Read the live unsaved text, selection, version, and page of the active StoryOS chapter editor.",
      schema: z.object({}),
    },
  );

  const replaceRange = tool(
    async ({ chapter_id, expected_version, from, to, replacement }) =>
      JSON.stringify(await client.invoke(projectId, {
        kind: "replace_range",
        chapterId: chapter_id,
        expectedVersion: expected_version,
        from,
        to,
        replacement,
      }), null, 2),
    {
      name: "replace_active_editor_range",
      description: [
        "Insert, replace, or delete a range in the live active chapter editor.",
        "First call get_active_editor_context and pass its exact chapterId and version.",
        "The end position is exclusive. Use equal from/to positions to insert.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
        replacement: z.string(),
      }),
    },
  );

  const openChapter = tool(
    async ({ chapter_id, page_number }) => JSON.stringify(
      await client.invoke(projectId, {
        kind: "open_chapter",
        chapterId: chapter_id,
        ...(page_number === undefined ? {} : { pageNumber: page_number }),
      }),
      null,
      2,
    ),
    {
      name: "open_book_chapter",
      description: "Open a chapter, and optionally one of its pages, in the visible StoryOS editor.",
      schema: z.object({
        chapter_id: z.string().min(1),
        page_number: z.number().int().positive().optional(),
      }),
    },
  );

  const runCommand = tool(
    async ({ chapter_id, expected_version, command }) =>
      JSON.stringify(await client.invoke(projectId, {
        kind: "run_command",
        chapterId: chapter_id,
        expectedVersion: expected_version,
        command: command as EditorCommandName,
      }), null, 2),
    {
      name: "format_active_editor_selection",
      description: [
        "Run a supported Tiptap formatting command on the active editor selection.",
        "First call get_active_editor_context and pass its exact chapterId and version.",
        "If there is no selection, do not ask the user to select text: call inspect_active_editor_text and select_active_editor_range first.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        command: editorCommandSchema,
      }),
    },
  );

  const managePage = tool(
    async ({
      chapter_id,
      expected_version,
      action,
      page_number,
      target_page_number,
    }) => JSON.stringify(await client.invoke(projectId, {
      kind: "page_operation",
      chapterId: chapter_id,
      expectedVersion: expected_version,
      action,
      ...(page_number === undefined ? {} : { pageNumber: page_number }),
      ...(target_page_number === undefined
        ? {}
        : { targetPageNumber: target_page_number }),
    }), null, 2),
    {
      name: "manage_active_editor_page",
      description: [
        "Append, move, or delete a page in the active paginated chapter editor.",
        "Move requires page_number and target_page_number; delete requires page_number.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        action: z.enum(["append", "move", "delete"]),
        page_number: z.number().int().positive().optional(),
        target_page_number: z.number().int().positive().optional(),
      }),
    },
  );

  const setStyle = tool(
    async ({ chapter_id, expected_version, style }) => JSON.stringify(
      await client.invoke(projectId, {
        kind: "set_style",
        chapterId: chapter_id,
        expectedVersion: expected_version,
        style: style as EditorStyleChange,
      }),
      null,
      2,
    ),
    {
      name: "style_active_editor_selection",
      description: [
        "Apply marks, text color, background highlight, paragraph spacing/indentation, a safe link, or clear inline formatting on the active editor selection.",
        "First call get_active_editor_context and pass its exact chapterId and version.",
        "Use null to clear a color, highlight, line height, or link.",
        "If there is no selection, do not ask the user to select text: use inspect_active_editor_text and apply_active_editor_styles instead.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        style: editorStyleSchema,
      }),
    },
  );

  const inspectText = tool(
    async ({ queries }) => JSON.stringify(await client.invoke(projectId, {
      kind: "inspect_text",
      queries: queries.map((query) => ({
        text: query.text,
        caseSensitive: query.case_sensitive,
      })),
    }), null, 2),
    {
      name: "inspect_active_editor_text",
      description: [
        "Find one or more literal strings in the live active editor and return their real ProseMirror ranges, snippets, counts, and editor version.",
        "Call this before apply_active_editor_styles so expected counts can be approved and conflict-checked.",
      ].join(" "),
      schema: z.object({
        queries: z.array(z.object({
          text: z.string().min(1).max(200),
          case_sensitive: z.boolean().optional().default(true),
        })).min(1).max(20),
      }),
    },
  );

  const selectRange = tool(
    async ({ chapter_id, expected_version, from, to, expected_text }) =>
      JSON.stringify(await client.invoke(projectId, {
        kind: "select_range",
        chapterId: chapter_id,
        expectedVersion: expected_version,
        range: { from, to, expectedText: expected_text },
      }), null, 2),
    {
      name: "select_active_editor_range",
      description: [
        "Select an exact verified ProseMirror range in the visible editor.",
        "Use a range and version returned by inspect_active_editor_text.",
        "This is mainly for selection-dependent structural commands; use apply_active_editor_styles for batch inline styling.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        from: z.number().int().nonnegative(),
        to: z.number().int().positive(),
        expected_text: z.string().min(1),
      }),
    },
  );

  const applyTargetedStyles = tool(
    async ({ chapter_id, expected_version, operations }) => JSON.stringify(
      await client.invoke(projectId, {
        kind: "apply_targeted_styles",
        chapterId: chapter_id,
        expectedVersion: expected_version,
        operations: operations.map((operation) => ({
          selector: toEditorTargetSelector(operation.selector),
          style: toEditorStyle(operation.style),
        })),
      }),
      null,
      2,
    ),
    {
      name: "apply_active_editor_styles",
      description: [
        "Atomically apply different rich-text styles to multiple literal text matches or verified ranges in the live editor.",
        "First call inspect_active_editor_text, then pass its exact chapterId, version, and match counts.",
        "All selectors are validated before one undoable transaction; no partial changes are written on conflict.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        operations: z.array(z.object({
          selector: editorTargetSelectorSchema,
          style: editorStyleSchema,
        })).min(1).max(50),
      }),
    },
  );

  return [
    getContext,
    inspectText,
    openChapter,
    selectRange,
    replaceRange,
    runCommand,
    setStyle,
    applyTargetedStyles,
    managePage,
  ];
}
