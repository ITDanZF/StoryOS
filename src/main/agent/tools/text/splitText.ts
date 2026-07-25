import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { offsetToPosition } from "./ranges.ts";
import { createStructuralChunks } from "./indexing/structuralChunks.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
} from "./source.ts";

type SplitUnit = {
  readonly start: number;
  readonly end: number;
  readonly size: number;
};

function regexUnits(content: string, pattern: RegExp): SplitUnit[] {
  return [...content.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    size: 1,
  }));
}

function lineUnits(content: string): SplitUnit[] {
  if (!content) return [];
  const units: SplitUnit[] = [];
  let start = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") continue;
    units.push({ start, end: index + 1, size: 1 });
    start = index + 1;
  }
  if (start < content.length) {
    units.push({ start, end: content.length, size: 1 });
  }
  return units;
}

function characterUnits(
  content: string,
  estimatedTokens: boolean,
): SplitUnit[] {
  const units: SplitUnit[] = [];
  let offset = 0;
  for (const character of content) {
    const start = offset;
    offset += character.length;
    const isCjk =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
        character,
      );
    const size = estimatedTokens
      ? isCjk
        ? 1
        : /\s/u.test(character)
          ? 0
          : 0.25
      : 1;
    units.push({ start, end: offset, size });
  }
  return units;
}

function getUnits(
  content: string,
  strategy:
    | "lines"
    | "paragraphs"
    | "sentences"
    | "characters"
    | "estimated_tokens"
    | "structure",
): SplitUnit[] {
  switch (strategy) {
    case "lines":
      return lineUnits(content);
    case "paragraphs":
      return regexUnits(content, /\S[\s\S]*?(?=\n\s*\n|$)/g);
    case "sentences":
      return regexUnits(content, /[^。！？!?\n]+[。！？!?]*|[^\n]+$/gu);
    case "characters":
      return characterUnits(content, false);
    case "estimated_tokens":
      return characterUnits(content, true);
    case "structure":
      return createStructuralChunks(content).map((chunk) => ({
        start: chunk.startOffset,
        end: chunk.endOffset,
        size: 1,
      }));
  }
}

function createChunks(
  content: string,
  units: readonly SplitUnit[],
  maximumSize: number,
  overlap: number,
  maximumChunks: number,
  includeText: boolean,
) {
  if (overlap >= maximumSize) {
    throw new Error("overlap must be smaller than max_size.");
  }
  const chunks: Array<Record<string, unknown>> = [];
  let unitIndex = 0;
  while (unitIndex < units.length && chunks.length < maximumChunks) {
    let endIndex = unitIndex;
    let size = 0;
    while (endIndex < units.length) {
      const nextSize = size + units[endIndex].size;
      if (endIndex > unitIndex && nextSize > maximumSize) break;
      size = nextSize;
      endIndex += 1;
    }

    const first = units[unitIndex];
    const last = units[endIndex - 1];
    const chunkText = content.slice(first.start, last.end);
    chunks.push({
      index: chunks.length,
      start: offsetToPosition(content, first.start),
      end: offsetToPosition(content, last.end),
      characters: chunkText.length,
      size: Number(size.toFixed(2)),
      ...(includeText ? { text: chunkText } : {}),
    });

    if (endIndex >= units.length) break;
    if (overlap === 0) {
      unitIndex = endIndex;
      continue;
    }
    let overlapSize = 0;
    let nextStart = endIndex;
    while (nextStart > unitIndex) {
      const candidate = units[nextStart - 1].size;
      if (overlapSize + candidate > overlap) break;
      overlapSize += candidate;
      nextStart -= 1;
    }
    unitIndex = nextStart === unitIndex ? endIndex : nextStart;
  }

  return Object.freeze({
    chunks,
    chunk_count: chunks.length,
    limited: unitIndex < units.length,
  });
}

export function createSplitTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({
      strategy,
      max_size,
      overlap = 0,
      max_chunks = 100,
      include_text = true,
      ...sourceInput
    }) => {
      const source = await loadTextSource(context, sourceInput);
      const units = getUnits(source.content, strategy);
      const result = createChunks(
        source.content,
        units,
        max_size,
        overlap,
        max_chunks,
        include_text,
      );
      return stringifyTextToolResult({
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        strategy,
        result,
        warnings: result.limited
          ? [`Split results were truncated at ${max_chunks} chunks.`]
          : [],
      });
    },
    {
      name: "split_text",
      description: [
        "Split text into bounded chunks by document structure, lines, paragraphs, sentences, Unicode characters, or estimated tokens.",
        "Supports overlap, chunk limits, exact positions, and metadata-only results.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        strategy: z.enum([
          "lines",
          "paragraphs",
          "sentences",
          "characters",
          "estimated_tokens",
          "structure",
        ]),
        max_size: z.number().positive().max(100_000),
        overlap: z.number().min(0).max(99_999).optional(),
        max_chunks: z.number().int().positive().max(500).optional(),
        include_text: z.boolean().optional(),
      }),
    },
  );
}
