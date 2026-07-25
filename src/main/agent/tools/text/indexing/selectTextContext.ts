import { tool } from "langchain";
import { z } from "zod";
import { estimateTokenCount } from "../textStats.ts";
import { stringifyTextToolResult } from "../source.ts";
import type TextIndexService from "./TextIndexService.ts";
import type { IndexedTextChunk } from "./types.ts";

type ContextCandidate = {
  readonly chunk: IndexedTextChunk;
  readonly score: number;
  readonly relationship: "match" | "neighbor";
  readonly relatedTo?: string;
};

export function createSelectTextContextTool(index: TextIndexService) {
  return tool(
    async ({
      query,
      token_budget,
      paths,
      glob,
      candidate_limit = 50,
      include_neighbors = 1,
      max_chunks_per_file = 5,
    }) => {
      const hits = await index.search(query, {
        paths,
        glob,
        limit: candidate_limit,
      });
      const candidates: ContextCandidate[] = [];
      const seen = new Set<string>();
      for (const hit of hits) {
        if (!seen.has(hit.chunk.id)) {
          seen.add(hit.chunk.id);
          candidates.push({
            chunk: hit.chunk,
            score: hit.score,
            relationship: "match",
          });
        }
        for (const neighbor of await index.getNeighbors(
          hit.chunk,
          include_neighbors,
        )) {
          if (seen.has(neighbor.id)) continue;
          seen.add(neighbor.id);
          candidates.push({
            chunk: neighbor,
            score: hit.score * 0.7,
            relationship: "neighbor",
            relatedTo: hit.chunk.id,
          });
        }
      }
      candidates.sort((left, right) => right.score - left.score);

      const selected: Array<Record<string, unknown>> = [];
      const fileCounts = new Map<string, number>();
      let estimatedTokens = 0;
      for (const candidate of candidates) {
        const currentFileCount = fileCounts.get(candidate.chunk.path) ?? 0;
        if (currentFileCount >= max_chunks_per_file) continue;
        const chunkTokens = estimateTokenCount(candidate.chunk.content);
        if (estimatedTokens + chunkTokens > token_budget) continue;
        estimatedTokens += chunkTokens;
        fileCounts.set(candidate.chunk.path, currentFileCount + 1);
        selected.push({
          score: Number(candidate.score.toFixed(4)),
          relationship: candidate.relationship,
          ...(candidate.relatedTo ? { related_to: candidate.relatedTo } : {}),
          estimated_tokens: chunkTokens,
          ...candidate.chunk,
        });
      }

      const assembledContext = selected
        .map((item) => {
          const start = item.start as { readonly line: number };
          const end = item.end as { readonly line: number };
          return [
            `<source path="${item.path}" lines="${start.line}-${end.line}">`,
            String(item.content),
            "</source>",
          ].join("\n");
        })
        .join("\n\n");

      return stringifyTextToolResult({
        source: "local-text-index",
        query,
        result: {
          selections: selected,
          selection_count: selected.length,
          estimated_tokens: estimatedTokens,
          token_budget,
          assembled_context: assembledContext,
          candidate_count: candidates.length,
        },
        warnings:
          hits.length > 0 && selected.length === 0
            ? [
                "Relevant chunks were found, but none fit within the token budget.",
              ]
            : [],
      });
    },
    {
      name: "select_text_context",
      description: [
        "Select diverse, evidence-backed local text context for a query within an estimated token budget.",
        "Combines BM25 ranking, neighboring structural chunks, deduplication, and per-file limits without embeddings.",
      ].join(" "),
      schema: z.object({
        query: z.string().trim().min(1),
        token_budget: z.number().int().positive().max(100_000),
        paths: z.array(z.string().min(1)).max(100).optional(),
        glob: z.string().optional(),
        candidate_limit: z.number().int().positive().max(200).optional(),
        include_neighbors: z.number().int().min(0).max(3).optional(),
        max_chunks_per_file: z.number().int().positive().max(50).optional(),
      }),
    },
  );
}
