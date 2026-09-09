export type CapabilityId = string;
export type EffectId = string;
export type AgentContextKind = string;
export type AgentExecutionMode = "direct" | "planned";
export type AgentOutputKind = "text";
export const CAPABILITY_IDS = Object.freeze([
  "conversation.respond",
  "workspace.read",
  "workspace.write",
  "text.inspect",
  "text.search",
  "text.rewrite",
  "text.review",
  "skill.write",
]);
export const EFFECT_IDS = Object.freeze(["workspace.write", "skill.write"]);
const identifier = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;
export function isCapabilityId(value: string): value is CapabilityId {
  return identifier.test(value);
}
export function isEffectId(value: string): value is EffectId {
  return identifier.test(value);
}
export function coversAll<T>(available: readonly T[], required: readonly T[]): boolean {
  const values = new Set(available);
  return required.every((item) => values.has(item));
}
