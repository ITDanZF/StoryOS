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

export type ModelStreamPart = {
  readonly channel: "reasoning" | "answer";
  readonly delta: string;
};

export interface ModelGateway {
  stream(input: ModelRunInput): AsyncIterable<string | ModelStreamPart>;
  invokeText?(input: ModelRunInput): Promise<string>;
}
