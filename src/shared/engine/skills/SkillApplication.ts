import type { SkillLoadIssue } from "./SkillLoader.ts";
import type { SkillSummary } from "./SkillTypes.ts";

export type SkillSnapshot = {
  readonly skills: readonly SkillSummary[];
  readonly issues: readonly SkillLoadIssue[];
  readonly loadedAt: string;
};
