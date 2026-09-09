import type { AgentFailureCode, AgentFailurePhase } from "../../../shared/engine/AgentFailure.ts";
export type { AgentFailureCode, AgentFailurePhase } from "../../../shared/engine/AgentFailure.ts";

export default class AgentFailure extends Error {
  readonly name = "AgentFailure";

  constructor(
    readonly code: AgentFailureCode,
    readonly phase: AgentFailurePhase,
    message: string,
    readonly retryable: boolean,
    readonly details: Readonly<{
      taskId?: string;
      agentId?: string;
      toolId?: string;
    }> = {},
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
