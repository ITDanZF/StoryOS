import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { KNOWN_M0_TOOL_NAMES, REQUIRED_BUNDLED_SKILL_IDS } from "./DefaultSkillIndex.ts";
import { checksumSkillDirectory } from "./SkillChecksum.ts";
import { parseSkillFile, validateSkillManifest, type SkillManifest } from "./SkillManifest.ts";
import {
  getBundledSkillRoot,
  getSkillCacheRoot,
  getSkillHome,
  getSkillIndexPath,
  getSkillMarketplaceCacheRoot,
  getSystemSkillRoot,
  getUserSkillRoot,
} from "./SkillPaths.ts";

export type SkillBootstrapResult = {
  readonly createdDirectories: readonly string[];
  readonly syncedSkills: readonly string[];
  readonly updatedSkills: readonly string[];
  readonly skippedSkills: readonly string[];
  readonly warnings: readonly string[];
};

type InstallMetadata = {
  readonly id: string;
  readonly kind: "system";
  readonly managed: boolean;
  readonly version: number;
  readonly source: {
    readonly type: "bundled";
    readonly root: string;
  };
  readonly bundledChecksum: string;
  readonly installedChecksum: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly enabled: boolean;
};

type SkillIndex = {
  readonly version: 1;
  readonly systemSkillIds: readonly string[];
  readonly disabledSkillIds: readonly string[];
  readonly installed: Readonly<Record<string, {
    readonly kind: "system";
    readonly version: number;
    readonly enabled: boolean;
    readonly managed: boolean;
  }>>;
};

type MutableBootstrapResult = {
  createdDirectories: string[];
  syncedSkills: string[];
  updatedSkills: string[];
  skippedSkills: string[];
  warnings: string[];
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(directoryPath: string, result: MutableBootstrapResult) {
  if (!await exists(directoryPath)) {
    await mkdir(directoryPath, { recursive: true });
    result.createdDirectories.push(directoryPath);
    return;
  }

  await mkdir(directoryPath, { recursive: true });
}

function assertSafeSkillId(skillId: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(skillId)) {
    throw new Error(`Invalid skill id: ${skillId}`);
  }
}

async function readInstallMetadata(installPath: string): Promise<InstallMetadata | null> {
  if (!await exists(installPath)) {
    return null;
  }

  try {
    const value = JSON.parse(await readFile(installPath, "utf-8")) as InstallMetadata;
    if (value.kind !== "system" || value.managed !== true) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

async function copySkillDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  const temporaryRoot = `${targetRoot}.tmp-${randomUUID()}`;
  await rm(temporaryRoot, { recursive: true, force: true });
  await cp(sourceRoot, temporaryRoot, { recursive: true });
  await rm(targetRoot, { recursive: true, force: true });
  await rename(temporaryRoot, targetRoot);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export type SkillBootstrapOptions = {
  readonly bundledSkillRoot?: string;
  readonly systemSkillRoot?: string;
  readonly userSkillRoot?: string;
  readonly skillHome?: string;
  readonly skillCacheRoot?: string;
  readonly marketplaceCacheRoot?: string;
  readonly skillIndexPath?: string;
  readonly requiredSkillIds?: readonly string[];
  readonly knownToolNames?: readonly string[];
};

export default class SkillBootstrap {
  private readonly bundledSkillRoot: string;
  private readonly systemSkillRoot: string;
  private readonly userSkillRoot: string;
  private readonly skillHome: string;
  private readonly skillCacheRoot: string;
  private readonly marketplaceCacheRoot: string;
  private readonly skillIndexPath: string;
  private readonly requiredSkillIds: readonly string[];
  private readonly knownToolNames: readonly string[];

  constructor(options: SkillBootstrapOptions = {}) {
    this.bundledSkillRoot = options.bundledSkillRoot ?? getBundledSkillRoot();
    this.systemSkillRoot = options.systemSkillRoot ?? getSystemSkillRoot();
    this.userSkillRoot = options.userSkillRoot ?? getUserSkillRoot();
    this.skillHome = options.skillHome ?? getSkillHome();
    this.skillCacheRoot = options.skillCacheRoot ?? getSkillCacheRoot();
    this.marketplaceCacheRoot = options.marketplaceCacheRoot ?? getSkillMarketplaceCacheRoot();
    this.skillIndexPath = options.skillIndexPath ?? getSkillIndexPath();
    this.requiredSkillIds = options.requiredSkillIds ?? REQUIRED_BUNDLED_SKILL_IDS;
    this.knownToolNames = options.knownToolNames ?? KNOWN_M0_TOOL_NAMES;
  }

  async ensureSkillRoots(): Promise<SkillBootstrapResult> {
    const result = this.createResult();

    await ensureDirectory(this.skillHome, result);
    await ensureDirectory(this.systemSkillRoot, result);
    await ensureDirectory(this.userSkillRoot, result);
    await ensureDirectory(this.skillCacheRoot, result);
    await ensureDirectory(this.marketplaceCacheRoot, result);

    await this.writeSkillIndex([]);
    return this.freezeResult(result);
  }

  async syncBundledSkills(): Promise<SkillBootstrapResult> {
    const result = this.createResult();
    await this.ensureSkillRoots();

    const bundledSkills = await this.readBundledSkills();
    const bundledSkillIds = new Set(bundledSkills.map((skill) => skill.manifest.id));

    for (const requiredSkillId of this.requiredSkillIds) {
      if (!bundledSkillIds.has(requiredSkillId)) {
        throw new Error(`Required bundled skill is missing: ${requiredSkillId}`);
      }
    }

    for (const skill of bundledSkills) {
      await this.syncSkill(skill, result);
    }

    await this.writeSkillIndex(bundledSkills.map((skill) => skill.manifest));
    return this.freezeResult(result);
  }

  private async readBundledSkills(): Promise<readonly {
    readonly manifest: SkillManifest;
    readonly sourceRoot: string;
    readonly checksum: string;
  }[]> {
    if (!await exists(this.bundledSkillRoot)) {
      throw new Error(`Bundled skill root does not exist: ${this.bundledSkillRoot}`);
    }

    const entries = await readdir(this.bundledSkillRoot, { withFileTypes: true });
    const skills: {
      readonly manifest: SkillManifest;
      readonly sourceRoot: string;
      readonly checksum: string;
    }[] = [];
    const ids = new Set<string>();

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const sourceRoot = path.join(this.bundledSkillRoot, entry.name);
      const skillFilePath = path.join(sourceRoot, "SKILL.md");
      if (!await exists(skillFilePath)) {
        throw new Error(`Bundled skill is missing SKILL.md: ${sourceRoot}`);
      }

      const parsed = parseSkillFile(await readFile(skillFilePath, "utf-8"));
      const manifest = validateSkillManifest(parsed.manifest, {
        knownToolNames: this.knownToolNames,
      });
      assertSafeSkillId(manifest.id);

      if (manifest.id !== entry.name) {
        throw new Error(
          `Bundled skill directory must match manifest id: ${entry.name} != ${manifest.id}`,
        );
      }
      if (ids.has(manifest.id)) {
        throw new Error(`Duplicate bundled skill id: ${manifest.id}`);
      }

      ids.add(manifest.id);
      skills.push(Object.freeze({
        manifest,
        sourceRoot,
        checksum: await checksumSkillDirectory(sourceRoot),
      }));
    }

    return Object.freeze(skills.sort((left, right) =>
      left.manifest.id.localeCompare(right.manifest.id),
    ));
  }

  private async syncSkill(
    skill: {
      readonly manifest: SkillManifest;
      readonly sourceRoot: string;
      readonly checksum: string;
    },
    result: MutableBootstrapResult,
  ): Promise<void> {
    const targetRoot = path.join(this.systemSkillRoot, skill.manifest.id);
    const installPath = path.join(targetRoot, "install.json");
    const timestamp = new Date().toISOString();

    if (!await exists(targetRoot)) {
      await copySkillDirectory(skill.sourceRoot, targetRoot);
      await this.writeInstallMetadata({
        skill,
        installPath,
        installedAt: timestamp,
        updatedAt: timestamp,
      });
      result.syncedSkills.push(skill.manifest.id);
      return;
    }

    const install = await readInstallMetadata(installPath);
    if (!install) {
      result.skippedSkills.push(skill.manifest.id);
      result.warnings.push(
        `System skill is unmanaged or missing install metadata: ${skill.manifest.id}`,
      );
      return;
    }

    const runtimeChecksum = await checksumSkillDirectory(targetRoot);
    if (runtimeChecksum !== install.installedChecksum) {
      const newRoot = `${targetRoot}.new`;
      await rm(newRoot, { recursive: true, force: true });
      await cp(skill.sourceRoot, newRoot, { recursive: true });
      result.skippedSkills.push(skill.manifest.id);
      result.warnings.push(
        `System skill was modified locally; wrote bundled update to ${newRoot}`,
      );
      return;
    }

    if (
      install.bundledChecksum === skill.checksum &&
      install.version === skill.manifest.version
    ) {
      return;
    }

    await copySkillDirectory(skill.sourceRoot, targetRoot);
    await this.writeInstallMetadata({
      skill,
      installPath,
      installedAt: install.installedAt,
      updatedAt: timestamp,
    });
    result.updatedSkills.push(skill.manifest.id);
  }

  private async writeInstallMetadata(input: {
    readonly skill: {
      readonly manifest: SkillManifest;
      readonly sourceRoot: string;
      readonly checksum: string;
    };
    readonly installPath: string;
    readonly installedAt: string;
    readonly updatedAt: string;
  }): Promise<void> {
    const metadata: InstallMetadata = Object.freeze({
      id: input.skill.manifest.id,
      kind: "system",
      managed: true,
      version: input.skill.manifest.version,
      source: Object.freeze({
        type: "bundled",
        root: path.relative(process.cwd(), input.skill.sourceRoot) || input.skill.sourceRoot,
      }),
      bundledChecksum: input.skill.checksum,
      installedChecksum: await checksumSkillDirectory(path.dirname(input.installPath)),
      installedAt: input.installedAt,
      updatedAt: input.updatedAt,
      enabled: true,
    });

    await writeJsonFile(input.installPath, metadata);
  }

  private async writeSkillIndex(
    manifests: readonly SkillManifest[],
  ): Promise<void> {
    const installed = Object.fromEntries(
      manifests.map((manifest) => [
        manifest.id,
        {
          kind: "system" as const,
          version: manifest.version,
          enabled: true,
          managed: true,
        },
      ]),
    );
    const skillIndex: SkillIndex = Object.freeze({
      version: 1,
      systemSkillIds: Object.freeze(manifests.map((manifest) => manifest.id).sort()),
      disabledSkillIds: Object.freeze([]),
      installed: Object.freeze(installed),
    });

    await writeJsonFile(this.skillIndexPath, skillIndex);
  }

  private createResult(): MutableBootstrapResult {
    return {
      createdDirectories: [],
      syncedSkills: [],
      updatedSkills: [],
      skippedSkills: [],
      warnings: [],
    };
  }

  private freezeResult(result: MutableBootstrapResult): SkillBootstrapResult {
    return Object.freeze({
      createdDirectories: Object.freeze([...result.createdDirectories]),
      syncedSkills: Object.freeze([...result.syncedSkills]),
      updatedSkills: Object.freeze([...result.updatedSkills]),
      skippedSkills: Object.freeze([...result.skippedSkills]),
      warnings: Object.freeze([...result.warnings]),
    });
  }
}
