import { tool } from "langchain";
import { z } from "zod";
import type { SkillInstaller } from "../../skills/SkillInstallService.ts";

export function createSkillTool(installer: SkillInstaller) {
  return tool(
    async ({ id, content }) => {
      const created = await installer.installUserSkill({ id, content });
      return [
        `Skill created and loaded: ${created.id}`,
        `Path: ${created.filePath}`,
        "Run /skills to view loaded skills or /skill <id> for details.",
      ].join("\n");
    },
    {
      name: "create_skill",
      returnDirect: true,
      description: [
        "Create and install a user Skill from complete SKILL.md content.",
        "Use this instead of write_file when the user asks to create a Skill.",
        "The target path is fixed by the application: ~/.mini-agent/skills/user/<id>/SKILL.md.",
        "Never include an arbitrary file path; provide only the skill id and full SKILL.md content.",
      ].join(" "),
      schema: z.object({
        id: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_-]*$/)
          .describe("Skill id. Must match the id in the SKILL.md frontmatter."),
        content: z
          .string()
          .min(1)
          .describe("Complete SKILL.md content, including frontmatter and body."),
      }),
    },
  );
}
