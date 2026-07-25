import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import {
  loadTextSource,
  stringifyTextToolResult,
  textSourceFields,
} from "./source.ts";

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

export function estimateTokenCount(content: string): number {
  const cjkCharacters = countMatches(content, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu);
  const remainingCharacters = content
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, "")
    .replace(/\s/g, "")
    .length;
  return cjkCharacters + Math.ceil(remainingCharacters / 4);
}

export function calculateTextStats(content: string) {
  const lines = content.length === 0 ? [] : content.split("\n");
  const paragraphs = content.trim()
    ? content.trim().split(/\n\s*\n/).filter((item) => item.trim())
    : [];
  const paragraphLengths = paragraphs.map((paragraph) => paragraph.length);
  const latinWords = countMatches(content, /[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  const cjkCharacters = countMatches(content, /\p{Script=Han}/gu);
  const sentences = content.trim()
    ? content.split(/[。！？!?]+(?:["'”’」』】）)]*)\s*/u)
      .filter((item) => item.trim()).length
    : 0;

  return Object.freeze({
    characters: content.length,
    characters_without_whitespace: content.replace(/\s/g, "").length,
    bytes_utf8: Buffer.byteLength(content, "utf8"),
    lines: lines.length,
    non_empty_lines: lines.filter((line) => line.trim()).length,
    paragraphs: paragraphs.length,
    sentences,
    cjk_characters: cjkCharacters,
    latin_words: latinWords,
    punctuation_marks: countMatches(content, /[\p{P}]/gu),
    longest_paragraph_characters: Math.max(0, ...paragraphLengths),
    average_paragraph_characters: paragraphLengths.length === 0
      ? 0
      : Math.round(
        paragraphLengths.reduce((total, length) => total + length, 0)
          / paragraphLengths.length,
      ),
    estimated_tokens: estimateTokenCount(content),
  });
}

export function createTextStatsTool(context: WorkspaceToolContext) {
  return tool(
    async (input) => {
      const source = await loadTextSource(context, input);
      return stringifyTextToolResult({
        source: source.kind,
        ...(source.kind === "file" ? { path: source.relativePath } : {}),
        revision: source.revision,
        result: calculateTextStats(source.content),
        warnings: [],
      });
    },
    {
      name: "text_stats",
      description:
        "Calculate deterministic text statistics including characters, words, paragraphs, sentences, punctuation, UTF-8 bytes, and estimated tokens.",
      schema: z.object(textSourceFields),
    },
  );
}
