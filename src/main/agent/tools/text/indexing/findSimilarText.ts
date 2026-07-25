import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../../WorkspaceToolContext.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
} from "../source.ts";
import { createStructuralChunks } from "./structuralChunks.ts";
import type TextIndexService from "./TextIndexService.ts";
import { normalizedNgrams, normalizeSearchText } from "./tokenizer.ts";

const MAX_COMPARISONS = 1_000_000;

function jaccardSimilarity(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / Math.max(1, left.size + right.size - intersection);
}

export function createFindSimilarTextTool(
  context: WorkspaceToolContext,
  index: TextIndexService,
) {
  return tool(
    async ({ threshold = 0.55, paths, glob, limit = 50, ...sourceInput }) => {
      const source = await loadTextSource(context, sourceInput);
      const sourceChunks = createStructuralChunks(source.content);
      const effectiveSourceChunks =
        sourceChunks.length > 0
          ? sourceChunks
          : [
              {
                type: "section" as const,
                content: source.content,
                startOffset: 0,
                endOffset: source.content.length,
                start: { line: 1, column: 1 },
                end: { line: 1, column: source.content.length + 1 },
                headingPath: [],
              },
            ];
      const candidates = await index.getChunks(paths, glob);
      if (effectiveSourceChunks.length * candidates.length > MAX_COMPARISONS) {
        throw new Error(
          "Similarity comparison is too broad. Narrow paths or glob before retrying.",
        );
      }

      const matches: Array<Record<string, unknown>> = [];
      for (
        let sourceIndex = 0;
        sourceIndex < effectiveSourceChunks.length;
        sourceIndex += 1
      ) {
        const sourceChunk = effectiveSourceChunks[sourceIndex];
        const normalizedSource = normalizeSearchText(
          sourceChunk.content,
        ).replace(/[\p{P}\p{S}\s]/gu, "");
        const sourceNgrams = normalizedNgrams(sourceChunk.content);
        for (const candidate of candidates) {
          if (
            source.kind === "file" &&
            candidate.path === source.relativePath &&
            candidate.start.line === sourceChunk.start.line &&
            candidate.start.column === sourceChunk.start.column
          ) {
            continue;
          }
          const normalizedCandidate = normalizeSearchText(
            candidate.content,
          ).replace(/[\p{P}\p{S}\s]/gu, "");
          const exact =
            normalizedSource.length > 0 &&
            normalizedSource === normalizedCandidate;
          const similarity = exact
            ? 1
            : jaccardSimilarity(
                sourceNgrams,
                normalizedNgrams(candidate.content),
              );
          if (similarity < threshold) continue;
          matches.push({
            similarity: Number(similarity.toFixed(4)),
            exact,
            source_chunk: {
              index: sourceIndex,
              start: sourceChunk.start,
              end: sourceChunk.end,
              content: sourceChunk.content,
            },
            candidate,
          });
        }
      }

      matches.sort(
        (left, right) => Number(right.similarity) - Number(left.similarity),
      );
      return stringifyTextToolResult({
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        result: {
          matches: matches.slice(0, limit),
          match_count: matches.length,
          returned_count: Math.min(matches.length, limit),
          truncated: matches.length > limit,
        },
        warnings:
          matches.length > limit
            ? [`Similarity matches were truncated at ${limit}.`]
            : [],
      });
    },
    {
      name: "find_similar_text",
      description: [
        "Find exact and near-duplicate structural text chunks using normalized character n-gram Jaccard similarity.",
        "Runs entirely against the local project text index without embeddings.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        threshold: z.number().min(0).max(1).optional(),
        paths: z.array(z.string().min(1)).max(100).optional(),
        glob: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      }),
    },
  );
}
