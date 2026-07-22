import type { AgentEventHandler } from "../AgentEvent.ts";
import RunBudget, {
  createRunAbortScope,
  DEFAULT_RUN_LIMITS,
  RunTimedOutError,
  type RunAbortScope,
  type RunLimits,
} from "../RunLimits.ts";
import type { ToolApprovalHandler } from "../../security/ToolPolicy.ts";
import type { OrchestrationEventHandler } from "./contracts.ts";
import type { PlanProvider } from "./ports.ts";
import TaskScheduler from "./TaskScheduler.ts";

export interface DirectAgentRunner {
  run(input: string, options: Omit<AgentOrchestratorRunOptions, "onOrchestrationEvent">): Promise<string>;
  cancelRun(runId: string, reason?: unknown): boolean;
}

export interface PlanScheduler {
  run(request: Parameters<TaskScheduler["run"]>[0]): Promise<string>;
}

export type AgentOrchestratorRunOptions = {
  readonly runId: string;
  readonly threadId: string;
  readonly signal?: AbortSignal;
  readonly approval: ToolApprovalHandler;
  readonly onChunk: (chunk: string) => void | Promise<void>;
  readonly onAgentEvent: AgentEventHandler;
  readonly onOrchestrationEvent?: OrchestrationEventHandler;
};

export default class AgentOrchestrator {
  private readonly activeRuns = new Map<string, RunAbortScope>();

  constructor(
    private readonly directRunner: DirectAgentRunner,
    private readonly planner: PlanProvider,
    private readonly scheduler: PlanScheduler,
    private readonly limits: RunLimits = DEFAULT_RUN_LIMITS,
  ) {}

  async run(
    input: string,
    options: AgentOrchestratorRunOptions,
  ): Promise<string> {
    if (this.activeRuns.has(options.runId)) {
      throw new Error(`Run is already active: ${options.runId}`);
    }

    const scope = createRunAbortScope(this.limits.timeoutMs, options.signal);
    this.activeRuns.set(options.runId, scope);

    try {
      const plan = await this.planner.createPlan({
        runId: options.runId,
        threadId: options.threadId,
        goal: input,
        signal: scope.signal,
      });
      await options.onOrchestrationEvent?.({
        type: "plan_created",
        runId: options.runId,
        plan,
        timestamp: new Date().toISOString(),
      });

      if (plan.mode === "direct") {
        return await this.directRunner.run(input, {
          runId: options.runId,
          threadId: options.threadId,
          signal: scope.signal,
          approval: options.approval,
          onChunk: options.onChunk,
          onAgentEvent: options.onAgentEvent,
        });
      }

      const content = await this.scheduler.run({
        runId: options.runId,
        threadId: options.threadId,
        goal: input,
        plan,
        signal: scope.signal,
        budget: new RunBudget(this.limits),
        approval: options.approval,
        onAgentEvent: options.onAgentEvent,
        onEvent: options.onOrchestrationEvent,
      });
      await options.onChunk(content);
      return content;
    } catch (error) {
      if (scope.timedOut()) {
        throw new RunTimedOutError(this.limits.timeoutMs);
      }
      if (scope.signal.aborted) {
        throw scope.signal.reason ?? error;
      }
      throw error;
    } finally {
      scope.dispose();
      this.activeRuns.delete(options.runId);
    }
  }

  cancelRun(
    runId: string,
    reason: unknown = new Error("Agent orchestration cancelled."),
  ): boolean {
    const scope = this.activeRuns.get(runId);
    if (!scope || scope.signal.aborted) {
      return false;
    }
    scope.abort(reason);
    this.directRunner.cancelRun(runId, reason);
    return true;
  }
}
