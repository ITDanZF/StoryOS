import { defineAgent } from "../Agent/AgentDefinition.ts";
import type { AgentDefinition } from "../Agent/types.ts";
import type { SkillDefinition } from "./SkillTypes.ts";

export type SkillAgentCompilerOptions = {
  readonly knownToolNames?: readonly string[];
  readonly maxBodyChars?: number;
};

const DEFAULT_MAX_BODY_CHARS = 5000;

function metadataBoolean(skill: SkillDefinition, key: string): boolean | null {
  const value = skill.manifest.metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function truncateBody(body: string, maxChars: number): string {
  if (body.length <= maxChars) {
    return body;
  }

  return `${body.slice(0, Math.max(0, maxChars - 29)).trimEnd()}\n[Skill content truncated]`;
}

function validateTools(
  skill: SkillDefinition,
  tools: readonly string[],
  knownToolNames: readonly string[] | undefined,
): void {
  if (!knownToolNames) {
    return;
  }

  const knownTools = new Set(knownToolNames);
  for (const toolName of tools) {
    if (!knownTools.has(toolName)) {
      throw new Error(`Unknown tool in skill agent ${skill.manifest.id}: ${toolName}`);
    }
  }
}

function createSkillAgentSystemPrompt(skill: SkillDefinition, maxBodyChars: number): string {
  const triggers = skill.manifest.triggers?.length
    ? skill.manifest.triggers.map((trigger) => `- ${trigger}`).join("\n")
    : "- No explicit triggers.";

  return [
    `You are the ${skill.manifest.name} specialist agent for mini-agent-langchain.`,
    "",
    "Responsibilities:",
    skill.manifest.description,
    "",
    "Use when:",
    triggers,
    "",
    "Skill instructions:",
    truncateBody(skill.body, maxBodyChars),
    "",
    "Runtime rules:",
    "1. Base conclusions only on user-provided context and tool results.",
    "2. Do not claim to have used tools unless tool results are available.",
    "3. Skills do not grant extra tool permissions; normal approval and workspace boundaries still apply.",
    "4. Return a focused result for the delegated task.",
  ].join("\n");
}

export function compileSkillAgent(
  skill: SkillDefinition,
  options: SkillAgentCompilerOptions = {},
): AgentDefinition | null {
  if (skill.manifest.agent?.enabled !== true) {
    return null;
  }

  const tools = Object.freeze([
    ...(skill.manifest.agent.tools ?? skill.manifest.tools ?? []),
  ]);
  validateTools(skill, tools, options.knownToolNames);

  const readOnly = metadataBoolean(skill, "readOnly") === true;
  const planningEligible = readOnly;
  const agentId = skill.manifest.agent.id ?? skill.manifest.id;
  const agentName = skill.manifest.agent.name ?? skill.manifest.name;
  const category = skill.manifest.metadata?.category;

  return defineAgent({
    id: agentId,
    name: agentName,
    description: skill.manifest.description,
    systemPrompt: createSkillAgentSystemPrompt(
      skill,
      options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS,
    ),
    tools,
    model: "inherit",
    maxTurns: skill.manifest.agent.maxTurns ?? 6,
    metadata: {
      source: "skill",
      skillId: skill.manifest.id,
      skillSource: skill.source.type,
      readOnly,
      planningEligible,
      ...(typeof category === "string" ? { category } : {}),
    },
  });
}

export function compileSkillAgents(
  skills: readonly SkillDefinition[],
  options: SkillAgentCompilerOptions = {},
): readonly AgentDefinition[] {
  return Object.freeze(
    skills
      .map((skill) => compileSkillAgent(skill, options))
      .filter((agent): agent is AgentDefinition => agent !== null),
  );
}
