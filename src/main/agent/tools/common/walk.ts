import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_EXCLUDED_DIRS } from "./limits.ts";

export async function walkFiles(
  absolutePath: string,
  options: {
    recursive?: boolean;
    limit?: number;
  } = {},
) {
  const recursive = options.recursive ?? true;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const results: string[] = [];
  const startStat = await stat(absolutePath);

  if (startStat.isFile()) {
    return [absolutePath];
  }

  if (!startStat.isDirectory()) {
    throw new Error("Path is neither a file nor a directory.");
  }

  async function visit(directory: string) {
    if (results.length >= limit) {
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) {
        return;
      }

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!DEFAULT_EXCLUDED_DIRS.has(entry.name) && recursive) {
          await visit(entryPath);
        }
        continue;
      }

      if (entry.isFile()) {
        results.push(entryPath);
      }
    }
  }

  await visit(absolutePath);
  return results;
}
