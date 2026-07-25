import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import {
  positionToOffset,
  rangesOverlap,
  resolveTextRange,
  type ResolvedTextRange,
} from "./ranges.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
  writeTextSource,
} from "./source.ts";

const positionSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

const rangeSchema = z.object({
  start: positionSchema,
  end: positionSchema,
});

const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("insert"),
    at: positionSchema,
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("replace"),
    range: rangeSchema,
    text: z.string(),
  }),
  z.object({
    type: z.literal("delete"),
    range: rangeSchema,
  }),
]);

type BatchOperation = z.infer<typeof operationSchema>;

type ResolvedOperation = {
  readonly index: number;
  readonly range: ResolvedTextRange;
  readonly replacement: string;
};

function resolveOperation(
  content: string,
  operation: BatchOperation,
  index: number,
): ResolvedOperation {
  if (operation.type === "insert") {
    const offset = positionToOffset(content, operation.at);
    return { index, range: { start: offset, end: offset }, replacement: operation.text };
  }
  return {
    index,
    range: resolveTextRange(content, operation.range),
    replacement: operation.type === "replace" ? operation.text : "",
  };
}

function applyOperations(
  content: string,
  operations: readonly BatchOperation[],
): string {
  const resolved = operations.map((operation, index) =>
    resolveOperation(content, operation, index));

  for (let first = 0; first < resolved.length; first += 1) {
    for (let second = first + 1; second < resolved.length; second += 1) {
      if (rangesOverlap(resolved[first].range, resolved[second].range)) {
        throw new Error(
          `Text operations ${resolved[first].index + 1} and ${resolved[second].index + 1} overlap.`,
        );
      }
    }
  }

  let updated = content;
  for (const operation of [...resolved].sort((left, right) =>
    right.range.start - left.range.start || right.index - left.index)) {
    updated = [
      updated.slice(0, operation.range.start),
      operation.replacement,
      updated.slice(operation.range.end),
    ].join("");
  }
  return updated;
}

export function createBatchEditTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      operations,
      expected_revision,
      preview_only = false,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      const updatedContent = applyOperations(source.content, operations);
      const changed = updatedContent !== source.content;

      if (source.kind === "inline" || preview_only || !changed) {
        return stringifyTextToolResult({
          source: source.kind,
          ...(source.kind === "file" ? { path: source.relativePath } : {}),
          preview: source.kind === "file" && preview_only,
          changed,
          revision: source.revision,
          operation_count: operations.length,
          result: { content: updatedContent },
          warnings: [],
        });
      }

      const written = await writeTextSource(
        context,
        source,
        updatedContent,
        expected_revision,
      );
      return stringifyTextToolResult({
        source: "file",
        path: written.path,
        changed: true,
        revision_before: source.revision,
        revision_after: written.revision,
        operation_count: operations.length,
        warnings: [],
      });
    },
    {
      name: "batch_edit_text",
      description: [
        "Atomically apply multiple non-overlapping insert, replace, or delete operations to one text source.",
        "All 1-based positions refer to the original text and range ends are exclusive.",
        "File changes require expected_revision unless preview_only is true.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        operations: z.array(operationSchema).min(1).max(100),
        expected_revision: z.string().optional(),
        preview_only: z.boolean().optional(),
      }),
    },
  );
}
