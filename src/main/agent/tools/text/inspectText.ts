import { readFile, stat } from "node:fs/promises";
import { tool } from "langchain";
import { z } from "zod";
import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { MAX_TEXT_FILE_BYTES } from "../common/limits.ts";
import { calculateTextRevision } from "../common/revision.ts";
import { detectLineEnding } from "../common/text.ts";
import { stringifyTextToolResult, textSourceFields } from "./source.ts";

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

function detectBufferEncoding(buffer: Buffer): {
  readonly encoding: string;
  readonly bom: string | null;
  readonly confidence: "high" | "medium" | "low";
} {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { encoding: "utf-8", bom: "utf-8", confidence: "high" };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return { encoding: "utf-16le", bom: "utf-16le", confidence: "high" };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    return { encoding: "utf-16be", bom: "utf-16be", confidence: "high" };
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { encoding: "utf-8", bom: null, confidence: "high" };
  } catch {
    const pairs = Math.max(1, Math.floor(buffer.length / 2));
    let evenNulls = 0;
    let oddNulls = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] !== 0) continue;
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
    if (oddNulls / pairs > 0.3) {
      return { encoding: "utf-16le", bom: null, confidence: "medium" };
    }
    if (evenNulls / pairs > 0.3) {
      return { encoding: "utf-16be", bom: null, confidence: "medium" };
    }
    try {
      new TextDecoder("gb18030", { fatal: true }).decode(buffer);
      return { encoding: "gb18030-candidate", bom: null, confidence: "low" };
    } catch {
      // The bytes do not form a valid GB18030 sequence either.
    }
    return { encoding: "unknown-legacy", bom: null, confidence: "low" };
  }
}

function decodeBuffer(buffer: Buffer, encoding: string): string {
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    return new TextDecoder(encoding).decode(buffer);
  }
  if (encoding === "gb18030-candidate") {
    return new TextDecoder("gb18030").decode(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function languageProfile(content: string) {
  const scripts = {
    han: countMatches(content, /\p{Script=Han}/gu),
    latin: countMatches(content, /\p{Script=Latin}/gu),
    hiragana: countMatches(content, /\p{Script=Hiragana}/gu),
    katakana: countMatches(content, /\p{Script=Katakana}/gu),
    hangul: countMatches(content, /\p{Script=Hangul}/gu),
    cyrillic: countMatches(content, /\p{Script=Cyrillic}/gu),
    arabic: countMatches(content, /\p{Script=Arabic}/gu),
  };
  const entries = Object.entries(scripts);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const primary = [...entries].sort((left, right) => right[1] - left[1])[0];
  return Object.freeze({
    primary_script:
      total === 0 || !primary || primary[1] === 0 ? "unknown" : primary[0],
    scripts: Object.fromEntries(
      entries.map(([name, count]) => [
        name,
        {
          characters: count,
          ratio: total === 0 ? 0 : Number((count / total).toFixed(4)),
        },
      ]),
    ),
  });
}

function inspectDecodedText(
  content: string,
  buffer?: Buffer,
  utf16Encoded = false,
) {
  const crlf = countMatches(content, /\r\n/g);
  const lfOnly = countMatches(content, /(?<!\r)\n/g);
  const crOnly = countMatches(content, /\r(?!\n)/g);
  const nullBytes = buffer
    ? [...buffer].filter((byte) => byte === 0).length
    : countMatches(content, /\0/g);
  const controlCharacters = [...content].filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    );
  }).length;
  const replacementCharacters = countMatches(content, /\uFFFD/g);
  const mojibakeIndicators = countMatches(content, /(?:�|Ã.|Â.|â.)/g);
  return Object.freeze({
    characters: content.length,
    bytes: buffer?.length ?? Buffer.byteLength(content, "utf8"),
    line_endings: {
      detected: detectLineEnding(content),
      crlf,
      lf: lfOnly,
      cr: crOnly,
      mixed: [crlf, lfOnly, crOnly].filter((count) => count > 0).length > 1,
    },
    unicode: {
      control_characters: controlCharacters,
      replacement_characters: replacementCharacters,
      null_characters: countMatches(content, /\0/g),
      noncharacters: countMatches(content, /[\uFFFE\uFFFF]/g),
    },
    language: languageProfile(content),
    mojibake_indicators: mojibakeIndicators,
    likely_binary:
      !utf16Encoded &&
      nullBytes > 0 &&
      nullBytes / Math.max(1, buffer?.length ?? content.length) > 0.01,
  });
}

export function createInspectTextTool(context: WorkspaceToolContext) {
  return tool(
    async ({ text, path: filePath }) => {
      const hasText = text !== undefined;
      const hasPath = filePath !== undefined;
      if (hasText === hasPath) {
        throw new Error("Provide exactly one text source: text or path.");
      }

      if (hasText) {
        const content = text ?? "";
        if (Buffer.byteLength(content, "utf8") > MAX_TEXT_FILE_BYTES) {
          throw new Error(
            `Inline text exceeds the ${MAX_TEXT_FILE_BYTES}-byte inspection limit.`,
          );
        }
        return stringifyTextToolResult({
          source: "inline",
          revision: calculateTextRevision(content),
          encoding: {
            name: "unicode-string",
            bom: null,
            confidence: "high",
          },
          result: inspectDecodedText(content),
          warnings: [],
        });
      }

      const absolutePath = await context.paths.resolveExisting(filePath);
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) throw new Error("Path is not a file.");
      if (fileStat.size > MAX_TEXT_FILE_BYTES) {
        throw new Error(
          `File exceeds the ${MAX_TEXT_FILE_BYTES}-byte inspection limit.`,
        );
      }
      const buffer = await readFile(absolutePath);
      const encoding = detectBufferEncoding(buffer);
      const content = decodeBuffer(buffer, encoding.encoding);
      const result = inspectDecodedText(
        content,
        buffer,
        encoding.encoding.startsWith("utf-16"),
      );
      return stringifyTextToolResult({
        source: "file",
        path: context.paths.toRelative(absolutePath),
        revision: calculateTextRevision(content),
        encoding: {
          name: encoding.encoding,
          bom: encoding.bom,
          confidence: encoding.confidence,
        },
        result,
        warnings: [
          ...(encoding.encoding === "unknown-legacy"
            ? [
                "Encoding is not valid UTF-8 and could not be identified reliably.",
              ]
            : []),
          ...(result.mojibake_indicators > 0
            ? ["Text contains characters commonly associated with mojibake."]
            : []),
        ],
      });
    },
    {
      name: "inspect_text",
      description: [
        "Inspect inline text or a workspace file without modifying it.",
        "Reports encoding and BOM confidence, line endings, Unicode anomalies, script distribution, likely mojibake, and binary indicators.",
      ].join(" "),
      schema: z.object(textSourceFields),
    },
  );
}
