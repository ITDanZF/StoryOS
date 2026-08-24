import type {
  AgentContextKind,
  AgentOutputKind,
  CapabilityId,
  EffectId,
} from "../capabilities.ts";
import type { AgentFailureCode, AgentFailurePhase } from "../../errors/AgentFailure.ts";

export type ExecutionRequirements = {
  readonly capabilities: readonly CapabilityId[];
  readonly effects: readonly EffectId[];
  readonly contextKinds: readonly AgentContextKind[];
  readonly outputKind: AgentOutputKind;
  readonly decomposition: "forbidden" | "optional" | "required";
};

export type ProposedTask = {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly dependsOn: readonly string[];
  readonly required: boolean;
  readonly expectedOutput: string;
  readonly acceptanceCriteria: readonly string[];
  readonly requirements: ExecutionRequirements;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
};

export type PlannedTask = ProposedTask & {
  readonly assignedAgentId: string;
  readonly grantedToolIds: readonly string[];
};

export type DirectExecutionPlan = {
  readonly version: 2;
  readonly planId: string;
  readonly mode: "direct";
  readonly goal: string;
  readonly requirements: ExecutionRequirements;
  readonly grantedToolIds: readonly string[];
};

export type ProposedExecutionPlan = {
  readonly version: 2;
  readonly planId: string;
  readonly mode: "planned";
  readonly goal: string;
  readonly requirements: ExecutionRequirements;
  readonly tasks: readonly ProposedTask[];
  readonly finalAcceptanceCriteria: readonly string[];
};

export type PlannedExecutionPlan = Omit<ProposedExecutionPlan, "tasks"> & {
  readonly tasks: readonly PlannedTask[];
};

export type ExecutionPlan = DirectExecutionPlan | PlannedExecutionPlan;

export type ReviewFinding = {
  readonly criterion: string;
  readonly passed: boolean;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
};

export type ReviewResult = {
  readonly decision: "pass" | "retry" | "fail";
  readonly score: number;
  readonly findings: readonly ReviewFinding[];
  readonly retryInstruction?: string;
};

export type TaskResult = {
  readonly taskId: string;
  readonly agentRunId: string;
  readonly agentType: string;
  readonly attempt: number;
  readonly status: "completed" | "failed" | "aborted" | "timed_out";
  readonly content: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly error?: string;
  readonly review?: ReviewResult;
};

export type ApprovedTaskResult = TaskResult & {
  readonly status: "completed";
  readonly review: ReviewResult & { readonly decision: "pass" };
};

export type SerializableTaskFailure = {
  readonly code: AgentFailureCode;
  readonly phase: AgentFailurePhase;
  readonly message: string;
  readonly retryable: boolean;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly toolId?: string;
};

export type OrchestrationEvent =
  | { readonly type: "plan_created"; readonly runId: string; readonly plan: ExecutionPlan; readonly timestamp: string }
  | { readonly type: "task_started"; readonly runId: string; readonly planId: string; readonly taskId: string; readonly title: string; readonly agentType: string; readonly attempt: number; readonly timestamp: string }
  | { readonly type: "task_reviewed"; readonly runId: string; readonly planId: string; readonly taskId: string; readonly attempt: number; readonly decision: ReviewResult["decision"]; readonly score: number; readonly timestamp: string }
  | { readonly type: "task_retrying"; readonly runId: string; readonly planId: string; readonly taskId: string; readonly nextAttempt: number; readonly timestamp: string }
  | { readonly type: "task_completed"; readonly runId: string; readonly planId: string; readonly taskId: string; readonly timestamp: string }
  | { readonly type: "task_skipped"; readonly runId: string; readonly planId: string; readonly taskId: string; readonly timestamp: string; readonly failure: SerializableTaskFailure }
  | { readonly type: "task_failed"; readonly runId: string; readonly planId: string; readonly taskId: string; readonly timestamp: string; readonly failure: SerializableTaskFailure }
  | { readonly type: "synthesis_started" | "synthesis_completed"; readonly runId: string; readonly planId: string; readonly timestamp: string };

export type OrchestrationEventHandler = (
  event: OrchestrationEvent,
) => void | Promise<void>;
