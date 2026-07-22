import { readFile, stat } from "node:fs/promises";
import { MAX_READ_RESULT_CHARS, MAX_TEXT_FILE_BYTES } from "./limits.ts";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".class",
  ".jar",
  ".sqlite",
  ".db",
]);

export type LineEnding = "LF" | "CRLF";

export function detectLineEnding(content: string): LineEnding {
  return content.includes("\r\n") ? "CRLF" : "LF";
}

export function normalizeLineEndings(content: string) {
  return content.replaceAll("\r\n", "\n");
}

export function restoreLineEndings(content: string, lineEnding: LineEnding) {
  return lineEnding === "CRLF" ? content.replaceAll("\n", "\r\n") : content;
}

export function assertLooksLikeText(filePath: string, buffer: Buffer) {
  const lowerPath = filePath.toLowerCase();
  for (const ext of BINARY_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) {
      throw new Error(`Binary files are not supported by this initial IO tool: ${ext}`);
    }
  }

  if (buffer.includes(0)) {
    throw new Error("The file appears to be binary and cannot be read as text.");
  }
}

export async function readTextFile(absolutePath: string) {
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error("Path is not a file.");
  }

  if (fileStat.size > MAX_TEXT_FILE_BYTES) {
    throw new Error(
      `File is too large for the initial IO tool (${fileStat.size} bytes). Maximum is ${MAX_TEXT_FILE_BYTES} bytes.`,
    );
  }

  const buffer = await readFile(absolutePath);
  assertLooksLikeText(absolutePath, buffer);

  const rawContent = buffer.toString("utf8");
  return {
    content: normalizeLineEndings(rawContent),
    lineEnding: detectLineEnding(rawContent),
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
  };
}

export function sliceLines(content: string, offset = 1, limit?: number) {
  const lines = content.length === 0 ? [] : content.split("\n");
  const startIndex = Math.max(offset, 1) - 1;
  const endIndex = limit === undefined ? lines.length : startIndex + limit;
  const selectedLines = lines.slice(startIndex, endIndex);

  return {
    selectedLines,
    startLine: startIndex + 1,
    totalLines: lines.length,
    partial: startIndex > 0 || endIndex < lines.length,
  };
}

export function addLineNumbers(lines: string[], startLine: number) {
  return lines
    .map((line, index) => `${String(startLine + index).padStart(6, " ")} | ${line}`)
    .join("\n");
}

export function truncateResult(content: string) {
  if (content.length <= MAX_READ_RESULT_CHARS) {
    return {
      content,
      truncated: false,
    };
  }

  return {
    content: content.slice(0, MAX_READ_RESULT_CHARS),
    truncated: true,
  };
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wildcardToRegExp(pattern: string) {
  const normalizedPattern = pattern.split("\\").join("/");
  const escaped = escapeRegExp(normalizedPattern)
    .replaceAll("\\*\\*", ".*")
    .replaceAll("\\*", "[^/]*")
    .replaceAll("\\?", ".");

  return new RegExp(`^${escaped}$`);
}
