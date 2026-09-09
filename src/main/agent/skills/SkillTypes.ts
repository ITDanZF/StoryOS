import type { SkillSourceType } from "../../../shared/engine/skills/SkillTypes.ts";
import type { SkillManifest } from "./SkillManifest.ts";
export type {
  SkillDetail,
  SkillSourceType,
  SkillSummary,
} from "../../../shared/engine/skills/SkillTypes.ts";

export type SkillSource = {
  readonly type: SkillSourceType;
  readonly root: string;
  readonly filePath: string;
};

export type SkillDefinition = {
  readonly manifest: SkillManifest;
  readonly body: string;
  readonly source: SkillSource;
  readonly loadedAt: Date;
};
