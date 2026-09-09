export type ThreadMetadata = {
  readonly activeSkillIds?: readonly string[];
  readonly disabledSkillIds?: readonly string[];
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ThreadSkillState = {
  readonly activeSkillIds: readonly string[];
  readonly disabledSkillIds: readonly string[];
};
