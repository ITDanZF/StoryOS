import type { AgentEventHandler } from "../Agent/AgentEvent.ts";
import type { ToolApprovalHandler } from "../security/ToolPolicy.ts";
import type { OrchestrationEventHandler } from "../Agent/orchestration/contracts.ts";

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
  run(input: string, options: AgentRunnerRunOptions): Promise<string>;
  cancelRun(runId: string, reason?: unknown): boolean;
}
