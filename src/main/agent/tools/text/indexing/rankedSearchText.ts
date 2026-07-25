import { tool } from "langchain";
import { z } from "zod";
import type TextIndexService from "./TextIndexService.ts";
import { stringifyTextToolResult } from "../source.ts";

export function createRankedSearchTextTool(index: TextIndexService) {
  return tool(
    async ({ query, paths, glob, limit = 20, include_neighbors = 0 }) => {
      const hits = await index.search(query, { paths, glob, limit });
      const results: Array<Record<string, unknown>> = [];
      const included = new Set<string>();

      for (const hit of hits) {
        if (!included.has(hit.chunk.id)) {
          included.add(hit.chunk.id);
          results.push({
            relationship: "match",
            score: hit.score,
            matched_terms: hit.matchedTerms,
            ...hit.chunk,
          });
        }
        for (const neighbor of await index.getNeighbors(
          hit.chunk,
          include_neighbors,
        )) {
          if (included.has(neighbor.id)) continue;
          included.add(neighbor.id);
          results.push({
            relationship: "neighbor",
            related_to: hit.chunk.id,
            score: Number((hit.score * 0.75).toFixed(4)),
            matched_terms: [],
            ...neighbor,
          });
        }
      }

      return stringifyTextToolResult({
        source: "local-text-index",
        query,
        result: {
          matches: results,
          match_count: hits.length,
          returned_count: results.length,
        },
        warnings: [],
      });
    },
    {
      name: "ranked_search_text",
      description: [
        "Search the local project text index with explainable BM25 ranking.",
        "Uses Chinese word segmentation, CJK n-grams, exact phrase and heading boosts.",
        "Can include neighboring structural chunks and never calls a remote service.",
      ].join(" "),
      schema: z.object({
        query: z.string().trim().min(1),
        paths: z.array(z.string().min(1)).max(100).optional(),
        glob: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
        include_neighbors: z.number().int().min(0).max(3).optional(),
      }),
    },
  );
}
