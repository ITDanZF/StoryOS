export type SkillDetail = SkillSummary & {
  readonly triggers: readonly string[];
  readonly tools: readonly string[];
  readonly agentTools: readonly string[];
  readonly filePath: string;
  readonly body: string;
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

export type SkillSourceType = "system" | "user" | "project";
