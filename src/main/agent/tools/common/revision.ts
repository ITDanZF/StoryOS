import { createHash } from "node:crypto";
import {
  detectLineEnding,
  normalizeLineEndings,
  type LineEnding,
} from "./text.ts";

export function calculateTextRevision(
  content: string,
  lineEnding: LineEnding = detectLineEnding(content),
): string {
  return createHash("sha256")
    .update(`${lineEnding}\0`, "utf8")
    .update(normalizeLineEndings(content), "utf8")
    .digest("hex");
}
