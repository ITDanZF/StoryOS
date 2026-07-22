import { constants as fsConstants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { KNOWN_M0_TOOL_NAMES } from "./DefaultSkillIndex.ts";
import { parseSkillFile, validateSkillManifest } from "./SkillManifest.ts";
import { getUserSkillRoot } from "./SkillPaths.ts";

export type SkillTemplateRequest = {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
};

export type CreateUserSkillRequest = SkillTemplateRequest & {
  readonly id: string;
};

export type CreateUserSkillFromContentRequest = {
  readonly id: string;
  readonly content: string;
};

export type CreatedUserSkill = {
  readonly id: string;
  readonly root: string;
  readonly filePath: string;
  readonly content: string;
};

export type SkillScaffoldServiceOptions = {
  readonly userSkillRoot?: string;
  readonly knownToolNames?: readonly string[];
};

const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeSkillId(skillId: string): string {
  const normalized = skillId.trim();
  if (!SKILL_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid skill id: ${skillId}`);
  }
  return normalized;
}

function toDefaultName(skillId: string): string {
  return skillId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || "Example Skill";
}

export default class SkillScaffoldService {
  private readonly userSkillRoot: string;
  private readonly knownToolNames: readonly string[];

  constructor(options: SkillScaffoldServiceOptions = {}) {
    this.userSkillRoot = options.userSkillRoot ?? getUserSkillRoot();
    this.knownToolNames = options.knownToolNames ?? KNOWN_M0_TOOL_NAMES;
  }

  renderTemplate(request: SkillTemplateRequest = {}): string {
    const skillId = request.id ? normalizeSkillId(request.id) : "example-skill";
    const name = request.name?.trim() || toDefaultName(skillId);
    const description = request.description?.trim() ||
      "简短说明这个 Skill 解决什么问题、适用于什么场景。";

    return `---
id: ${skillId}
name: ${name}
version: 1
description: ${description}
triggers:
  - 示例触发词
tools:
  - read_file
agent:
  enabled: false
metadata:
  category: general
  readOnly: true
---

# ${name}

## 使用场景

说明用户在什么情况下应该使用这个 Skill。

## 输入要求

说明需要用户提供哪些信息。

## 标准工作流程

1. 第一步。
2. 第二步。
3. 第三步。

## 输出格式

说明最终回答应该如何组织。

## 质量检查清单

- 是否满足用户目标。
- 是否遵守工具和安全限制。
- 是否给出清晰可执行的结果。
`;
  }

  async createUserSkill(request: CreateUserSkillRequest): Promise<CreatedUserSkill> {
    const skillId = normalizeSkillId(request.id);
    const content = this.renderTemplate({
      id: skillId,
      name: request.name,
      description: request.description,
    });

    return this.createUserSkillFromContent({ id: skillId, content });
  }

  async createUserSkillFromContent(
    request: CreateUserSkillFromContentRequest,
  ): Promise<CreatedUserSkill> {
    const skillId = normalizeSkillId(request.id);
    const skillRoot = path.join(this.userSkillRoot, skillId);
    const skillFilePath = path.join(skillRoot, "SKILL.md");

    if (!this.isInsideUserSkillRoot(skillRoot)) {
      throw new Error(`Skill path escapes user skill root: ${skillId}`);
    }
    if (await exists(skillRoot)) {
      throw new Error(`User skill already exists: ${skillId}`);
    }

    const content = request.content.endsWith("\n")
      ? request.content
      : `${request.content}\n`;
    const parsed = parseSkillFile(content);
    validateSkillManifest(parsed.manifest, {
      knownToolNames: this.knownToolNames,
    });
    if (parsed.manifest.id !== skillId) {
      throw new Error(`Skill content id mismatch: expected ${skillId}, got ${parsed.manifest.id}`);
    }

    await mkdir(skillRoot, { recursive: true });
    await writeFile(skillFilePath, content, "utf-8");

    return Object.freeze({
      id: skillId,
      root: skillRoot,
      filePath: skillFilePath,
      content,
    });
  }

  private isInsideUserSkillRoot(candidatePath: string): boolean {
    const relativePath = path.relative(this.userSkillRoot, candidatePath);
    return relativePath === "" || (
      !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
    );
  }
}
