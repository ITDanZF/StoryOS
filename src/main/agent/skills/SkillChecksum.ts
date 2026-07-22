import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_EXCLUDED_FILES = new Set(["install.json"]);

async function listFiles(root: string, currentDirectory = root): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, entryPath));
    } else if (entry.isFile()) {
      files.push(path.relative(root, entryPath));
    }
  }

  return files;
}

export async function checksumFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export async function checksumSkillDirectory(
  root: string,
  excludedFiles: ReadonlySet<string> = DEFAULT_EXCLUDED_FILES,
): Promise<string> {
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Skill root is not a directory: ${root}`);
  }

  const files = (await listFiles(root))
    .filter((filePath) => !excludedFiles.has(filePath))
    .sort();
  const hash = createHash("sha256");

  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(path.join(root, relativePath)));
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}
