import type { AgentRunResult } from "../AgentRuntime.ts";
import type RunBudget from "../RunLimits.ts";
import type { ToolApprovalHandler } from "../../security/ToolPolicy.ts";
import type { AgentEventHandler } from "../AgentEvent.ts";
import type { ModelRunInput } from "../../model/Model.ts";
import type {
  ApprovedTaskResult,
  ExecutionPlan,
  PlannedExecutionPlan,
  PlannedTask,
  ReviewResult,
  TaskResult,
} from "./contracts.ts";

export type PlanningRequest = {
  readonly runId: string;
  readonly threadId: string;
  readonly goal: string;
  readonly signal?: AbortSignal;
};

export interface PlanProvider {
  createPlan(request: PlanningRequest): Promise<ExecutionPlan>;
}

export interface OrchestrationTextModel {
  invokeText(input: ModelRunInput): Promise<string>;
}

export type TaskExecutionRequest = {
  readonly rootRunId: string;
  readonly threadId: string;
  readonly task: PlannedTask;
  readonly attempt: number;
  readonly dependencyResults: readonly ApprovedTaskResult[];
  readonly previousResult?: TaskResult;
  readonly retryInstruction?: string;
  readonly signal?: AbortSignal;
  readonly budget: RunBudget;
  readonly approval: ToolApprovalHandler;
  readonly onAgentEvent: AgentEventHandler;
};

export interface PlannedTaskRunner {
  runTask(request: TaskExecutionRequest): Promise<AgentRunResult>;
}

export type ReviewRequest = {
  readonly rootRunId: string;
  readonly threadId: string;
  readonly task: PlannedTask;
  readonly result: TaskResult;
  readonly dependencyResults: readonly ApprovedTaskResult[];
  readonly signal?: AbortSignal;
};

export interface ResultReviewProvider {
  review(request: ReviewRequest): Promise<ReviewResult>;
}

export type SynthesisRequest = {
  readonly rootRunId: string;
  readonly threadId: string;
  readonly goal: string;
  readonly plan: PlannedExecutionPlan;
  readonly results: readonly ApprovedTaskResult[];
  readonly signal?: AbortSignal;
};

export interface AnswerSynthesisProvider {
  synthesize(request: SynthesisRequest): Promise<string>;
}
