export type CapabilityId =
  | "conversation.respond"
  | "workspace.read"
  | "workspace.write"
  | "text.inspect"
  | "text.search"
  | "text.rewrite"
  | "text.review"
  | "book.read"
  | "book.write"
  | "editor.read"
  | "editor.write"
  | "skill.write";

export type EffectId =
  | "workspace.write"
  | "book.write"
  | "editor.write"
  | "skill.write";

export type AgentContextKind = "global" | "book-editor";
export type AgentExecutionMode = "direct" | "planned";
export type AgentOutputKind = "text";

export const CAPABILITY_IDS: readonly CapabilityId[] = Object.freeze([
  "conversation.respond",
  "workspace.read",
  "workspace.write",
  "text.inspect",
  "text.search",
  "text.rewrite",
  "text.review",
  "book.read",
  "book.write",
  "editor.read",
  "editor.write",
  "skill.write",
]);

export const EFFECT_IDS: readonly EffectId[] = Object.freeze([
  "workspace.write",
  "book.write",
  "editor.write",
  "skill.write",
]);

const capabilityIds = new Set<string>(CAPABILITY_IDS);
const effectIds = new Set<string>(EFFECT_IDS);

export function isCapabilityId(value: string): value is CapabilityId {
  return capabilityIds.has(value);
}

export function isEffectId(value: string): value is EffectId {
  return effectIds.has(value);
}

export function coversAll<T>(
  available: readonly T[],
  required: readonly T[],
): boolean {
  const values = new Set(available);
  return required.every((item) => values.has(item));
}
