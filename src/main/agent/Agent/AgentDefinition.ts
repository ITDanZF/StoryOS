import type { AgentDefinition } from './types.ts';
import { isCapabilityId, isEffectId } from "./capabilities.ts";

const AGENT_ID_PATTERN = /^[a-z0-9_-]+$/;

export function validateAgentDefinition(
  definition: AgentDefinition,
): void {
  if (!definition.id.trim()) {
    throw new Error('Agent id is required.');
  }

  if (!AGENT_ID_PATTERN.test(definition.id)) {
    throw new Error(`Invalid agent id: ${definition.id}`);
  }

  if (!definition.name.trim()) {
    throw new Error(`Agent name is required: ${definition.id}`);
  }

  if (!definition.description.trim()) {
    throw new Error(`Agent description is required: ${definition.id}`);
  }

  if (!definition.systemPrompt.trim()) {
    throw new Error(`Agent system prompt is required: ${definition.id}`);
  }

  const toolNames = new Set<string>();

  for (const toolName of definition.allowedToolIds) {
    if (!toolName.trim()) {
      throw new Error(`Agent tool name cannot be empty: ${definition.id}`);
    }

    if (toolNames.has(toolName)) {
      throw new Error(
        `Duplicate agent tool ${toolName}: ${definition.id}`,
      );
    }

    toolNames.add(toolName);
  }

  if (
    definition.model !== undefined &&
    !definition.model.trim()
  ) {
    throw new Error(`Agent model cannot be empty: ${definition.id}`);
  }

  if (definition.capabilities.length === 0) {
    throw new Error(`Agent capabilities are required: ${definition.id}`);
  }
  for (const capability of definition.capabilities) {
    if (!isCapabilityId(capability)) {
      throw new Error(`Unknown agent capability ${capability}: ${definition.id}`);
    }
  }
  for (const effect of definition.allowedEffects) {
    if (!isEffectId(effect)) {
      throw new Error(`Unknown agent effect ${effect}: ${definition.id}`);
    }
  }
  if (definition.acceptedContexts.length === 0) {
    throw new Error(`Agent acceptedContexts are required: ${definition.id}`);
  }
  if (definition.executionModes.length === 0) {
    throw new Error(`Agent executionModes are required: ${definition.id}`);
  }
  if (definition.outputKinds.length === 0) {
    throw new Error(`Agent outputKinds are required: ${definition.id}`);
  }
  if (
    !Number.isInteger(definition.limits.maxTurns) || definition.limits.maxTurns <= 0
  ) {
    throw new Error(
      `Agent maxTurns must be a positive integer: ${definition.id}`,
    );
  }
}

export function defineAgent(
  definition: AgentDefinition,
): AgentDefinition {
  validateAgentDefinition(definition);

  const metadata = definition.metadata
    ? Object.freeze({ ...definition.metadata })
    : undefined;

  return Object.freeze({
    ...definition,
    capabilities: Object.freeze([...new Set(definition.capabilities)]),
    allowedToolIds: Object.freeze([...definition.allowedToolIds]),
    allowedEffects: Object.freeze([...new Set(definition.allowedEffects)]),
    acceptedContexts: Object.freeze([...new Set(definition.acceptedContexts)]),
    executionModes: Object.freeze([...new Set(definition.executionModes)]),
    outputKinds: Object.freeze([...new Set(definition.outputKinds)]),
    limits: Object.freeze({ ...definition.limits }),
    ...(metadata ? { metadata } : {}),
  });
}
