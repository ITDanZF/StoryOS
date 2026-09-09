import type {
  AgentContextKind,
  AgentExecutionMode,
  AgentOutputKind,
  CapabilityId,
  EffectId,
} from "./capabilities.ts";

export type AgentDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly capabilities: readonly CapabilityId[];
  readonly allowedToolIds: readonly string[];
  readonly allowedEffects: readonly EffectId[];
  readonly acceptedContexts: readonly AgentContextKind[];
  readonly executionModes: readonly AgentExecutionMode[];
  readonly outputKinds: readonly AgentOutputKind[];
  readonly model?: string;
  readonly limits: {
    readonly maxTurns: number;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
};
