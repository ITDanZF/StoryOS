import { constants as fsConstants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { KNOWN_M0_TOOL_NAMES } from "./DefaultSkillIndex.ts";
import { parseSkillFile, validateSkillManifest } from "./SkillManifest.ts";
import { getSystemSkillRoot, getUserSkillRoot } from "./SkillPaths.ts";
import type { SkillDefinition, SkillSourceType } from "./SkillTypes.ts";

export type SkillLoadIssue = {
  readonly sourceType: SkillSourceType;
  readonly root: string;
  readonly filePath?: string;
  readonly message: string;
};

export type SkillLoadResult = {
  readonly skills: readonly SkillDefinition[];
  readonly issues: readonly SkillLoadIssue[];
};

export type SkillLoaderOptions = {
  readonly systemSkillRoot?: string;
  readonly userSkillRoot?: string;
  readonly knownToolNames?: readonly string[];
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadRoot(input: {
  readonly root: string;
  readonly sourceType: SkillSourceType;
  readonly knownToolNames: readonly string[];
  readonly loadedAt: Date;
}): Promise<SkillLoadResult> {
  if (!await exists(input.root)) {
    return Object.freeze({ skills: Object.freeze([]), issues: Object.freeze([]) });
  }

  const entries = await readdir(input.root, { withFileTypes: true });
  const skills: SkillDefinition[] = [];
  const issues: SkillLoadIssue[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillRoot = path.join(input.root, entry.name);
    const filePath = path.join(skillRoot, "SKILL.md");

    if (!await exists(filePath)) {
      issues.push(Object.freeze({
        sourceType: input.sourceType,
        root: skillRoot,
        filePath,
        message: "Skill directory is missing SKILL.md.",
      }));
      continue;
    }

    try {
      const parsed = parseSkillFile(await readFile(filePath, "utf-8"));
      const manifest = validateSkillManifest(parsed.manifest, {
        knownToolNames: input.knownToolNames,
      });

      if (manifest.id !== entry.name) {
        throw new Error(`Skill directory must match manifest id: ${entry.name} != ${manifest.id}`);
      }

      skills.push(Object.freeze({
        manifest,
        body: parsed.body,
        source: Object.freeze({
          type: input.sourceType,
          root: skillRoot,
          filePath,
        }),
        loadedAt: input.loadedAt,
      }));
    } catch (error) {
      issues.push(Object.freeze({
        sourceType: input.sourceType,
        root: skillRoot,
        filePath,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return Object.freeze({
    skills: Object.freeze(skills),
    issues: Object.freeze(issues),
  });
}

export default class SkillLoader {
  private readonly systemSkillRoot: string;
  private readonly userSkillRoot: string;
  private readonly knownToolNames: readonly string[];

  constructor(options: SkillLoaderOptions = {}) {
    this.systemSkillRoot = options.systemSkillRoot ?? getSystemSkillRoot();
    this.userSkillRoot = options.userSkillRoot ?? getUserSkillRoot();
    this.knownToolNames = options.knownToolNames ?? KNOWN_M0_TOOL_NAMES;
  }

  async loadAll(): Promise<SkillLoadResult> {
    const loadedAt = new Date();
    const systemResult = await loadRoot({
      root: this.systemSkillRoot,
      sourceType: "system",
      knownToolNames: this.knownToolNames,
      loadedAt,
    });
    const userResult = await loadRoot({
      root: this.userSkillRoot,
      sourceType: "user",
      knownToolNames: this.knownToolNames,
      loadedAt,
    });

    return Object.freeze({
      skills: Object.freeze([...systemResult.skills, ...userResult.skills]),
      issues: Object.freeze([...systemResult.issues, ...userResult.issues]),
    });
  }
}
