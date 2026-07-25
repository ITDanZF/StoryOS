import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { loadTextSource, stringifyTextToolResult } from "./source.ts";

const MAX_DIFF_CELLS = 1_000_000;
const MAX_DIFF_CHANGES = 500;

type DiffChange =
  | {
      readonly type: "remove";
      readonly left_line: number;
      readonly text: string;
    }
  | {
      readonly type: "add";
      readonly right_line: number;
      readonly text: string;
    };

function splitLines(content: string): string[] {
  return content.length === 0 ? [] : content.split("\n");
}

function compareLines(left: string[], right: string[]) {
  if ((left.length + 1) * (right.length + 1) > MAX_DIFF_CELLS) {
    throw new Error(
      `Texts are too large for line comparison (${left.length} x ${right.length} lines). Narrow the inputs before comparing.`,
    );
  }

  const table = Array.from(
    { length: left.length + 1 },
    () => new Uint32Array(right.length + 1),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (
      let rightIndex = right.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      table[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? table[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(
          table[leftIndex + 1][rightIndex],
          table[leftIndex][rightIndex + 1],
        );
    }
  }

  const changes: DiffChange[] = [];
  let additions = 0;
  let removals = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (
      leftIndex < left.length &&
      rightIndex < right.length &&
      left[leftIndex] === right[rightIndex]
    ) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    if (
      leftIndex < left.length &&
      (
        rightIndex >= right.length ||
        table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1]
      )
    ) {
      removals += 1;
      if (changes.length < MAX_DIFF_CHANGES) {
        changes.push({
          type: "remove",
          left_line: leftIndex + 1,
          text: left[leftIndex],
        });
      }
      leftIndex += 1;
      continue;
    }

    additions += 1;
    if (changes.length < MAX_DIFF_CHANGES) {
      changes.push({
        type: "add",
        right_line: rightIndex + 1,
        text: right[rightIndex],
      });
    }
    rightIndex += 1;
  }

  const commonLines = table[0][0];
  const totalLines = left.length + right.length;
  return Object.freeze({
    identical: additions === 0 && removals === 0,
    left_lines: left.length,
    right_lines: right.length,
    common_lines: commonLines,
    additions,
    removals,
    line_similarity: totalLines === 0
      ? 1
      : Number(((2 * commonLines) / totalLines).toFixed(4)),
    changes,
    changes_truncated: additions + removals > changes.length,
  });
}

export function createCompareTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({ left_text, left_path, right_text, right_path }) => {
      const [left, right] = await Promise.all([
        loadTextSource(context, { text: left_text, path: left_path }),
        loadTextSource(context, { text: right_text, path: right_path }),
      ]);
      const result = compareLines(
        splitLines(left.content),
        splitLines(right.content),
      );
      return stringifyTextToolResult({
        left: {
          source: left.kind,
          ...(left.kind === "file" ? { path: left.relativePath } : {}),
          revision: left.revision,
        },
        right: {
          source: right.kind,
          ...(right.kind === "file" ? { path: right.relativePath } : {}),
          revision: right.revision,
        },
        result,
        warnings: result.changes_truncated
          ? [`Diff changes were truncated at ${MAX_DIFF_CHANGES}.`]
          : [],
      });
    },
    {
      name: "compare_text",
      description:
        "Compare two inline texts or workspace text files by line, returning deterministic additions, removals, revisions, and line similarity.",
      schema: z.object({
        left_text: z.string().optional(),
        left_path: z.string().optional(),
        right_text: z.string().optional(),
        right_path: z.string().optional(),
      }),
    },
  );
}
