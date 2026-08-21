import { tool } from "langchain";
import { z } from "zod";
import type {
  EditorCommandName,
  EditorStyleChange,
  RendererEditorToolClient,
} from "./contracts.ts";

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
  "pageBreak",
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
        "Apply text color, background highlight, paragraph spacing/indentation, or a safe link to the active editor selection.",
        "First call get_active_editor_context and pass its exact chapterId and version.",
        "Use null to clear a color, highlight, line height, or link.",
      ].join(" "),
      schema: z.object({
        chapter_id: z.string().min(1),
        expected_version: z.number().int().nonnegative(),
        style: z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("text_color"),
            value: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
          }),
          z.object({
            kind: z.literal("background_color"),
            value: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
          }),
          z.object({
            kind: z.literal("paragraph"),
            lineHeight: z.enum(["1", "1.5", "1.75", "2"]).nullable().optional(),
            firstLineIndent: z.boolean().optional(),
            indentDelta: z.union([z.literal(-2), z.literal(2)]).optional(),
          }).refine(
            (value) => value.lineHeight !== undefined ||
              value.firstLineIndent !== undefined ||
              value.indentDelta !== undefined,
            { message: "At least one paragraph style must be provided." },
          ),
          z.object({
            kind: z.literal("link"),
            href: z.string().min(1).max(2048).nullable(),
          }),
        ]),
      }),
    },
  );

  return [
    getContext,
    openChapter,
    replaceRange,
    runCommand,
    setStyle,
    managePage,
  ];
}
