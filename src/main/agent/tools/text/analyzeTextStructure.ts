import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { offsetToPosition } from "./ranges.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
} from "./source.ts";

type StructureNodeType =
  | "heading"
  | "paragraph"
  | "unordered_list_item"
  | "ordered_list_item"
  | "blockquote"
  | "dialogue"
  | "code_block";

type LineRecord = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

function createLineRecords(content: string): LineRecord[] {
  if (!content) return [];
  const records: LineRecord[] = [];
  let start = 0;
  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && content[index] !== "\n") continue;
    records.push({
      text: content.slice(start, index),
      start,
      end: index,
    });
    start = index + 1;
  }
  return records;
}

function isSpecialLine(line: string): boolean {
  return /^(?:#{1,6}\s+|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*>\s?|\s*(?:```|~~~)|\s*(?:["“‘「『]|[-—]\s+))/u.test(
    line,
  );
}

export function createAnalyzeTextStructureTool(context: WorkspaceToolContext) {
  return tool(
    async ({ include_text = true, max_nodes = 1_000, ...sourceInput }) => {
      const source = await loadTextSource(context, sourceInput);
      const content = source.content;
      const lines = createLineRecords(content);
      const nodes: Array<Record<string, unknown>> = [];
      const counts: Partial<Record<StructureNodeType, number>> = {};
      const headingStack: Array<{
        readonly id: string;
        readonly level: number;
      }> = [];
      let totalNodes = 0;

      const addNode = (
        type: StructureNodeType,
        start: number,
        end: number,
        text: string,
        extra: Record<string, unknown> = {},
      ) => {
        totalNodes += 1;
        counts[type] = (counts[type] ?? 0) + 1;
        if (nodes.length >= max_nodes) return;
        const id = `node_${totalNodes}`;
        nodes.push({
          id,
          type,
          start: offsetToPosition(content, start),
          end: offsetToPosition(content, end),
          characters: text.length,
          ...(include_text ? { text } : {}),
          ...extra,
        });
        return id;
      };

      let paragraphStart = -1;
      let paragraphEnd = -1;
      const flushParagraph = () => {
        if (paragraphStart < 0) return;
        const text = content.slice(paragraphStart, paragraphEnd);
        addNode("paragraph", paragraphStart, paragraphEnd, text, {
          parent_heading_id: headingStack.at(-1)?.id,
        });
        paragraphStart = -1;
        paragraphEnd = -1;
      };

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.text.trim()) {
          flushParagraph();
          continue;
        }

        const fence = line.text.match(/^\s*(`{3,}|~{3,})(.*)$/);
        if (fence) {
          flushParagraph();
          const marker = fence[1][0];
          const markerLength = fence[1].length;
          let endIndex = index;
          for (
            let candidate = index + 1;
            candidate < lines.length;
            candidate += 1
          ) {
            endIndex = candidate;
            if (
              new RegExp(`^\\s*${marker}{${markerLength},}\\s*$`).test(
                lines[candidate].text,
              )
            ) {
              break;
            }
          }
          const end = lines[endIndex].end;
          addNode(
            "code_block",
            line.start,
            end,
            content.slice(line.start, end),
            {
              language: fence[2].trim() || null,
              closed:
                endIndex > index &&
                new RegExp(`^\\s*${marker}{${markerLength},}\\s*$`).test(
                  lines[endIndex].text,
                ),
            },
          );
          index = endIndex;
          continue;
        }

        const heading = line.text.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          flushParagraph();
          const level = heading[1].length;
          while (
            headingStack.length > 0 &&
            (headingStack.at(-1)?.level ?? 0) >= level
          ) {
            headingStack.pop();
          }
          const parentHeading = headingStack.at(-1)?.id;
          const id = addNode("heading", line.start, line.end, line.text, {
            level,
            title: heading[2],
            parent_heading_id: parentHeading,
          });
          if (id) headingStack.push({ id, level });
          continue;
        }

        const unordered = line.text.match(/^\s*[-*+]\s+(.+)$/);
        if (unordered) {
          flushParagraph();
          addNode("unordered_list_item", line.start, line.end, line.text, {
            content: unordered[1],
            parent_heading_id: headingStack.at(-1)?.id,
          });
          continue;
        }

        const ordered = line.text.match(/^\s*(\d+)[.)]\s+(.+)$/);
        if (ordered) {
          flushParagraph();
          addNode("ordered_list_item", line.start, line.end, line.text, {
            number: Number(ordered[1]),
            content: ordered[2],
            parent_heading_id: headingStack.at(-1)?.id,
          });
          continue;
        }

        const quote = line.text.match(/^\s*>\s?(.*)$/);
        if (quote) {
          flushParagraph();
          addNode("blockquote", line.start, line.end, line.text, {
            content: quote[1],
            parent_heading_id: headingStack.at(-1)?.id,
          });
          continue;
        }

        if (/^\s*(?:["“‘「『]|[-—]\s+)/u.test(line.text)) {
          flushParagraph();
          addNode("dialogue", line.start, line.end, line.text, {
            parent_heading_id: headingStack.at(-1)?.id,
          });
          continue;
        }

        if (paragraphStart < 0) paragraphStart = line.start;
        paragraphEnd = line.end;
        if (index + 1 >= lines.length || isSpecialLine(lines[index + 1].text)) {
          flushParagraph();
        }
      }
      flushParagraph();

      return stringifyTextToolResult({
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        result: {
          nodes,
          node_count: totalNodes,
          nodes_returned: nodes.length,
          nodes_truncated: totalNodes > nodes.length,
          counts,
          heading_depth: Math.max(
            0,
            ...nodes
              .filter((node) => node.type === "heading")
              .map((node) => Number(node.level)),
          ),
        },
        warnings:
          totalNodes > nodes.length
            ? [`Structure nodes were truncated at ${max_nodes}.`]
            : [],
      });
    },
    {
      name: "analyze_text_structure",
      description: [
        "Parse deterministic text structure with exact positions.",
        "Recognizes Markdown headings and hierarchy, paragraphs, list items, blockquotes, dialogue-like lines, and fenced code blocks.",
      ].join(" "),
      schema: z.object({
        ...textSourceFields,
        include_text: z.boolean().optional(),
        max_nodes: z.number().int().positive().max(2_000).optional(),
      }),
    },
  );
}
