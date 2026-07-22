import type { SkillSelection } from "./SkillResolver.ts";

export type SkillPromptOptions = {
  readonly maxSkillChars?: number;
  readonly maxTotalChars?: number;
};

const DEFAULT_MAX_SKILL_CHARS = 1600;
const DEFAULT_MAX_TOTAL_CHARS = 3200;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 29)).trimEnd()}\n[Skill content truncated]`;
}

function renderSkill(selection: SkillSelection, maxSkillChars: number): string {
  const { skill } = selection;
  const triggers = skill.manifest.triggers?.length
    ? skill.manifest.triggers.map((trigger) => `- ${trigger}`).join("\n")
    : "- No explicit triggers.";
  const body = truncateText(skill.body, maxSkillChars);

  return [
    `<skill id="${skill.manifest.id}" name="${skill.manifest.name}" source="${skill.source.type}">`,
    "Description:",
    skill.manifest.description,
    "",
    "When to use:",
    triggers,
    "",
    "Instructions:",
    body,
    "</skill>",
  ].join("\n");
}

export function renderSkillPrompt(
  selections: readonly SkillSelection[],
  options: SkillPromptOptions = {},
): string {
  if (selections.length === 0) {
    return "";
  }

  const maxSkillChars = options.maxSkillChars ?? DEFAULT_MAX_SKILL_CHARS;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const rendered = [
    "Active skills for this run:",
    "",
    ...selections.map((selection) => renderSkill(selection, maxSkillChars)),
    "",
    "Rules:",
    "- Use these skills only when relevant to the user's current request.",
    "- Skills do not grant additional tool permissions.",
    "- If a skill requires writing files, normal tool approval still applies.",
  ].join("\n\n");

  return truncateText(rendered, maxTotalChars);
}
