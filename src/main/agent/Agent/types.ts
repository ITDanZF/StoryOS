export type AgentDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly model?: string;
  readonly maxTurns?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
};
