export type TaskSideEffect = "none";

export type PlannedTask = {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly agentType: string;
  readonly dependsOn: readonly string[];
  readonly required: boolean;
  readonly expectedOutput: string;
  readonly acceptanceCriteria: readonly string[];
  readonly sideEffect: TaskSideEffect;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
};

export type DirectExecutionPlan = {
  readonly version: 1;
  readonly planId: string;
  readonly mode: "direct";
  readonly goal: string;
};

export type PlannedExecutionPlan = {
  readonly version: 1;
  readonly planId: string;
  readonly mode: "planned";
  readonly goal: string;
  readonly tasks: readonly PlannedTask[];
  readonly finalAcceptanceCriteria: readonly string[];
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

export type OrchestrationEvent =
  | {
      readonly type: "plan_created";
      readonly runId: string;
      readonly plan: ExecutionPlan;
      readonly timestamp: string;
    }
  | {
      readonly type: "task_started";
      readonly runId: string;
      readonly planId: string;
      readonly taskId: string;
      readonly agentType: string;
      readonly attempt: number;
      readonly timestamp: string;
    }
  | {
      readonly type: "task_reviewed";
      readonly runId: string;
      readonly planId: string;
      readonly taskId: string;
      readonly attempt: number;
      readonly decision: ReviewResult["decision"];
      readonly score: number;
      readonly timestamp: string;
    }
  | {
      readonly type: "task_retrying";
      readonly runId: string;
      readonly planId: string;
      readonly taskId: string;
      readonly nextAttempt: number;
      readonly timestamp: string;
    }
  | {
      readonly type: "task_completed" | "task_failed" | "task_skipped";
      readonly runId: string;
      readonly planId: string;
      readonly taskId: string;
      readonly timestamp: string;
      readonly error?: string;
    }
  | {
      readonly type: "synthesis_started" | "synthesis_completed";
      readonly runId: string;
      readonly planId: string;
      readonly timestamp: string;
    };

export type OrchestrationEventHandler = (
  event: OrchestrationEvent,
) => void | Promise<void>;
