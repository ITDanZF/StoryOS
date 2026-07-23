import type { RegisteredTool } from "../tools/ToolResolver.ts";

export type ModelRunInput = {
  readonly prompt: string;
  readonly threadId: string;
  readonly systemPrompt: string;
  readonly tools: RegisteredTool[];
  readonly signal?: AbortSignal;
  readonly maxTurns?: number;
  readonly visibility?: "public" | "internal";
};

export interface ModelGateway {
  stream(input: ModelRunInput): AsyncIterable<string>;
  invokeText?(input: ModelRunInput): Promise<string>;
}
