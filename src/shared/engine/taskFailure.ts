import type { AgentFailureCode, AgentFailurePhase } from "./AgentFailure.ts";

export type SerializableTaskFailure = {
  readonly code: AgentFailureCode;
  readonly phase: AgentFailurePhase;
  readonly message: string;
  readonly retryable: boolean;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly toolId?: string;
};
