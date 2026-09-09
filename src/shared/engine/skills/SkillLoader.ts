import type { SkillSourceType } from "./SkillTypes.ts";

export type SkillLoadIssue = {
  readonly sourceType: SkillSourceType;
  readonly root: string;
  readonly filePath?: string;
  readonly message: string;
};
