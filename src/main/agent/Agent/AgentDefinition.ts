import type { AgentDefinition } from './types.ts';

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

  for (const toolName of definition.tools) {
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

  if (
    definition.maxTurns !== undefined &&
    (!Number.isInteger(definition.maxTurns) || definition.maxTurns <= 0)
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
    tools: Object.freeze([...definition.tools]),
    ...(metadata ? { metadata } : {}),
  });
}
