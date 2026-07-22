import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentHome } from "../workspace/path.ts";

const SKILL_ROOT_ENV = "MINI_AGENT_BUNDLED_SKILLS";

function findPackageRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;
  for (;;) {
    if (existsSync(path.join(currentDirectory, "package.json"))) return currentDirectory;
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error(`Unable to find package root from ${startDirectory}`);
    }
    currentDirectory = parentDirectory;
  }
}

export function getPackageRoot(): string {
  return findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
}

export function getBundledSkillRoot(): string {
  const override = process.env[SKILL_ROOT_ENV]?.trim();
  return override ? path.resolve(override) : path.join(getPackageRoot(), "skills");
}

export function getSkillHome(): string { return path.join(getAgentHome(), "skills"); }
export function getSystemSkillRoot(): string { return path.join(getSkillHome(), "system"); }
export function getUserSkillRoot(): string { return path.join(getSkillHome(), "user"); }
export function getSkillCacheRoot(): string { return path.join(getSkillHome(), "cache"); }
export function getSkillMarketplaceCacheRoot(): string { return path.join(getSkillCacheRoot(), "marketplace"); }
export function getSkillIndexPath(): string { return path.join(getSkillHome(), "index.json"); }
