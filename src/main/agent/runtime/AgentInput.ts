import type { ExecutionRequirements } from "../orchestration/contracts.ts";
/** Host-provided context is compiled outside the engine. */
export type AgentInput = {
  readonly message: { readonly messageId: string; readonly content: string };
  readonly prompt?: string;
  readonly requirements?: ExecutionRequirements;
  readonly completion?: {
    readonly preferredToolIds?: readonly string[];
    readonly retryInstruction?: string;
  };
};
export type AgentTurnInput = AgentInput;
