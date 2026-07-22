import type { ModelRunInput } from "../model/Model.ts";
import { KNOWN_M0_TOOL_NAMES } from "./DefaultSkillIndex.ts";
import { parseSkillFile, validateSkillManifest } from "./SkillManifest.ts";

export type SkillDraftModel = {
  readonly invokeText: (input: ModelRunInput) => Promise<string>;
};

export type SkillDraftRequest = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly triggers: readonly string[];
  readonly tools: readonly string[];
  readonly agentEnabled: boolean;
  readonly readOnly: boolean;
  readonly extraInstructions?: string;
};

export type SkillDraftServiceOptions = {
  readonly knownToolNames?: readonly string[];
};

const DEFAULT_TOOLS = Object.freeze(["read_file"]);

function normalizeList(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))]);
}

function extractSkillMarkdown(response: string): string {
  const fencedMatch = response.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/i);
  return (fencedMatch?.[1] ?? response).trim();
}

function validateDraftContent(
  content: string,
  expectedId: string,
  knownToolNames: readonly string[],
): string {
  const parsed = parseSkillFile(content);
  validateSkillManifest(parsed.manifest, { knownToolNames });

  if (parsed.manifest.id !== expectedId) {
    throw new Error(`Generated skill id mismatch: expected ${expectedId}, got ${parsed.manifest.id}`);
  }

  return content.endsWith("\n") ? content : `${content}\n`;
}

function renderDraftPrompt(request: SkillDraftRequest, knownToolNames: readonly string[]): string {
  const tools = normalizeList(request.tools).length > 0
    ? normalizeList(request.tools)
    : DEFAULT_TOOLS;
  const triggers = normalizeList(request.triggers);

  return [
    "请生成一个完整、可直接保存的 SKILL.md 文件。",
    "只能输出 SKILL.md 内容；不要解释、不要额外前后缀。",
    "必须使用 YAML frontmatter，且 frontmatter 后必须有 Markdown 正文。",
    "frontmatter 必须包含：id、name、version、description、triggers、tools、agent、metadata。",
    "metadata 必须包含 category 与 readOnly。",
    "正文必须包含：使用场景、输入要求、标准工作流程、输出格式、质量检查清单。",
    `Skill ID: ${request.id}`,
    `Name: ${request.name}`,
    `Description: ${request.description}`,
    `Triggers: ${triggers.join(", ") || request.name}`,
    `Allowed tools in this project: ${knownToolNames.join(", ")}`,
    `Tools to declare: ${tools.join(", ")}`,
    `Agent enabled: ${request.agentEnabled ? "true" : "false"}`,
    `Read only: ${request.readOnly ? "true" : "false"}`,
    request.extraInstructions?.trim()
      ? `Additional user requirements:\n${request.extraInstructions.trim()}`
      : "Additional user requirements: none",
  ].join("\n");
}

export default class SkillDraftService {
  private readonly knownToolNames: readonly string[];

  constructor(
    private readonly model: SkillDraftModel,
    options: SkillDraftServiceOptions = {},
  ) {
    this.knownToolNames = options.knownToolNames ?? KNOWN_M0_TOOL_NAMES;
  }

  async generate(request: SkillDraftRequest): Promise<string> {
    const response = await this.model.invokeText({
      prompt: renderDraftPrompt(request, this.knownToolNames),
      threadId: `skill-create/${request.id}`,
      systemPrompt: [
        "你是 mini-agent 的 Skill 设计器。",
        "你只生成符合项目 SKILL.md schema 的文件内容。",
        "不得声明未知工具；不得更改用户指定的 id。",
      ].join("\n"),
      tools: [],
      maxTurns: 1,
      visibility: "internal",
    });

    return validateDraftContent(
      extractSkillMarkdown(response),
      request.id,
      this.knownToolNames,
    );
  }
}

export const __skillDraftTestUtils = Object.freeze({
  extractSkillMarkdown,
  renderDraftPrompt,
});
