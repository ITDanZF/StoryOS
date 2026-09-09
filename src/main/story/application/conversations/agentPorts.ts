import type { AgentTurnInput } from "../../../../shared/contracts/conversations/applicationContracts.ts";
import type { AgentEventHandler } from "../../../agent/runtime/AgentEvent.ts";
import type { OrchestrationEventHandler } from "../../../agent/orchestration/contracts.ts";
import type { ToolApprovalHandler } from "../../../agent/tools/security/ToolPolicy.ts";

export type AgentRunnerRunOptions = {
  readonly runId: string;
  readonly threadId: string;
  readonly signal?: AbortSignal;
  readonly approval: ToolApprovalHandler;
  readonly onChunk: (chunk: string) => void | Promise<void>;
  readonly onAgentEvent: AgentEventHandler;
  readonly onOrchestrationEvent: OrchestrationEventHandler;
};

export interface AgentRunner {
  run(input: AgentTurnInput, options: AgentRunnerRunOptions): Promise<string>;
  cancelRun(runId: string, reason?: unknown): boolean;
}
