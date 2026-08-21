import { z } from "zod";
import type {
  EditorStyleChange,
  EditorTargetSelector,
} from "./contracts.ts";

export const editorStyleSchema = z.union([
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
    href: z.string().min(1).max(2048).regex(
      /^(https?:\/\/|mailto:|tel:|#|\/)/i,
      "Only safe HTTP(S), mail, telephone, anchor, or relative links are allowed.",
    ).nullable(),
  }),
  z.object({
    kind: z.literal("mark"),
    mark: z.enum(["bold", "italic", "underline", "strike"]),
    enabled: z.boolean(),
  }),
  z.object({ kind: z.literal("clear_inline") }),
]);

const textSelectorSchema = z.object({
  kind: z.literal("text"),
  text: z.string().min(1).max(200),
  case_sensitive: z.boolean().optional().default(true),
  expected_count: z.number().int().nonnegative().max(1_000),
  occurrences: z.union([
    z.literal("all"),
    z.object({
      kind: z.literal("indices"),
      indices: z.array(z.number().int().nonnegative()).min(1).max(1_000),
    }),
  ]),
});

const rangesSelectorSchema = z.object({
  kind: z.literal("ranges"),
  ranges: z.array(z.object({
    from: z.number().int().nonnegative(),
    to: z.number().int().positive(),
    expected_text: z.string().min(1),
  })).min(1).max(1_000),
});

export const editorTargetSelectorSchema = z.union([
  textSelectorSchema,
  rangesSelectorSchema,
]);

export function toEditorStyle(value: z.infer<typeof editorStyleSchema>) {
  return value as EditorStyleChange;
}

export function toEditorTargetSelector(
  value: z.infer<typeof editorTargetSelectorSchema>,
): EditorTargetSelector {
  if (value.kind === "ranges") {
    return {
      kind: "ranges",
      ranges: value.ranges.map((range) => ({
        from: range.from,
        to: range.to,
        expectedText: range.expected_text,
      })),
    };
  }
  return {
    kind: "text",
    text: value.text,
    caseSensitive: value.case_sensitive,
    expectedCount: value.expected_count,
    occurrences: value.occurrences === "all"
      ? { kind: "all" }
      : value.occurrences,
  };
}
