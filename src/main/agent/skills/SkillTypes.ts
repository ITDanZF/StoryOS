import type { SkillManifest } from "./SkillManifest.ts";

export type SkillSourceType = "system" | "user";

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

export type SkillSummary = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly sourceType: SkillSourceType;
  readonly enabled: boolean;
  readonly managed: boolean;
  readonly agentEnabled: boolean;
  readonly readOnly: boolean | null;
};

export type SkillDetail = SkillSummary & {
  readonly triggers: readonly string[];
  readonly tools: readonly string[];
  readonly agentTools: readonly string[];
  readonly filePath: string;
  readonly body: string;
};
