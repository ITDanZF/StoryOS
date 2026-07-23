import { describe, expect, it, vi } from "vitest";
import type { AgentRunResult } from "../../src/main/agent/Agent/AgentRuntime.ts";
import RunBudget, {
  type RunLimits,
} from "../../src/main/agent/Agent/RunLimits.ts";
import type {
  OrchestrationEvent,
  PlannedExecutionPlan,
  ReviewResult,
} from "../../src/main/agent/Agent/orchestration/contracts.ts";
import type {
  AnswerSynthesisProvider,
  PlannedTaskRunner,
  ResultReviewProvider,
  ReviewRequest,
  SynthesisRequest,
  TaskExecutionRequest,
} from "../../src/main/agent/Agent/orchestration/ports.ts";
import TaskScheduler from "../../src/main/agent/Agent/orchestration/TaskScheduler.ts";

const limits: RunLimits = {
  maxTurns: 8,
  maxToolCalls: 20,
  timeoutMs: 0,
  maxDelegationDepth: 1,
};

const passReview: ReviewResult = {
  decision: "pass",
  score: 1,
  findings: [
    {
      criterion: "complete",
      passed: true,
      severity: "info",
      message: "Complete",
    },
  ],
};

const plan: PlannedExecutionPlan = {
  version: 1,
  planId: "plan-1",
  mode: "planned",
  goal: "analyze then review",
  tasks: [
    {
      id: "analyze",
      title: "Analyze",
      objective: "Analyze the text",
      agentType: "text-analyzer",
      dependsOn: [],
      required: true,
      expectedOutput: "Analysis",
      acceptanceCriteria: ["complete"],
      sideEffect: "none",
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
    {
      id: "review",
      title: "Review",
      objective: "Review the analysis",
      agentType: "text-reviewer",
      dependsOn: ["analyze"],
      required: true,
      expectedOutput: "Review",
      acceptanceCriteria: ["complete"],
      sideEffect: "none",
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
  ],
  finalAcceptanceCriteria: ["Return both results"],
};

function completedResult(
  taskId: string,
  agentType: string,
  attempt: number,
): AgentRunResult {
  return {
    status: "completed",
    runId: `agent-${taskId}-${attempt}`,
    agentType,
    threadId: `internal-${taskId}`,
    content: `${taskId}-result-${attempt}`,
  };
}

function createScheduleRequest(events: OrchestrationEvent[]) {
  return {
    runId: "run-1",
    threadId: "thread-1",
    goal: plan.goal,
    plan,
    budget: new RunBudget(limits),
    approval: async () => "deny" as const,
    onAgentEvent: (): void => undefined,
    onEvent: (event: OrchestrationEvent) => {
      events.push(event);
    },
  };
}

describe("TaskScheduler behavior", () => {
  it("runs dependencies in order and synthesizes only approved results", async () => {
    const executionOrder: string[] = [];
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request: TaskExecutionRequest) => {
        executionOrder.push(request.task.id);
        if (request.task.id === "review") {
          expect(request.dependencyResults.map((result) => result.taskId)).toEqual([
            "analyze",
          ]);
        }
        return completedResult(
          request.task.id,
          request.task.agentType,
          request.attempt,
        );
      }),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async () => passReview),
    };
    const synthesizer: AnswerSynthesisProvider = {
      synthesize: vi.fn(async (request: SynthesisRequest) => {
        expect(request.results.map((result) => result.taskId)).toEqual([
          "analyze",
          "review",
        ]);
        return "final answer";
      }),
    };
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);
    const events: OrchestrationEvent[] = [];

    await expect(
      scheduler.run(createScheduleRequest(events)),
    ).resolves.toBe("final answer");
    expect(executionOrder).toEqual(["analyze", "review"]);
    expect(events.map((event) => event.type)).toEqual([
      "task_started",
      "task_reviewed",
      "task_completed",
      "task_started",
      "task_reviewed",
      "task_completed",
      "synthesis_started",
      "synthesis_completed",
    ]);
  });

  it("retries a task when review requests a retry", async () => {
    const retryPlan: PlannedExecutionPlan = {
      ...plan,
      tasks: [{ ...plan.tasks[0], maxAttempts: 2 }],
    };
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request: TaskExecutionRequest) =>
        completedResult(
          request.task.id,
          request.task.agentType,
          request.attempt,
        )),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async (
        request: ReviewRequest,
      ): Promise<ReviewResult> =>
        request.result.attempt === 1
          ? {
              decision: "retry",
              score: 0.4,
              findings: [
                {
                  criterion: "complete",
                  passed: false,
                  severity: "warning",
                  message: "Needs more detail",
                },
              ],
              retryInstruction: "Add more detail.",
            }
          : passReview),
    };
    const synthesizer: AnswerSynthesisProvider = {
      synthesize: vi.fn(async () => "recovered answer"),
    };
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);
    const events: OrchestrationEvent[] = [];

    await expect(
      scheduler.run({
        ...createScheduleRequest(events),
        plan: retryPlan,
      }),
    ).resolves.toBe("recovered answer");
    expect(runner.runTask).toHaveBeenCalledTimes(2);
    expect(runner.runTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        attempt: 2,
        retryInstruction: "Add more detail.",
      }),
    );
    expect(events.some((event) => event.type === "task_retrying")).toBe(true);
  });

  it("stops without review events when cancellation happens during review", async () => {
    const controller = new AbortController();
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request: TaskExecutionRequest) =>
        completedResult(
          request.task.id,
          request.task.agentType,
          request.attempt,
        )),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async () => {
        controller.abort(new Error("stop during review"));
        throw new Error("review aborted");
      }),
    };
    const synthesizer: AnswerSynthesisProvider = {
      synthesize: vi.fn(async () => "unexpected"),
    };
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);
    const events: OrchestrationEvent[] = [];

    await expect(scheduler.run({
      ...createScheduleRequest(events),
      signal: controller.signal,
    })).rejects.toThrow("stop during review");
    expect(events.map((event) => event.type)).toEqual(["task_started"]);
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
  });

  it("enforces the root subtask budget across planned tasks", async () => {
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request: TaskExecutionRequest) =>
        completedResult(
          request.task.id,
          request.task.agentType,
          request.attempt,
        )),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async () => passReview),
    };
    const synthesizer: AnswerSynthesisProvider = {
      synthesize: vi.fn(async () => "unexpected"),
    };
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);
    const events: OrchestrationEvent[] = [];

    await expect(scheduler.run({
      ...createScheduleRequest(events),
      budget: new RunBudget({
        ...limits,
        maxSubtasks: 1,
      }),
    })).rejects.toThrow("Subtask budget exceeded");
    expect(runner.runTask).toHaveBeenCalledOnce();
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
  });

  it("skips dependent tasks after an optional dependency fails review", async () => {
    const dependencyPlan: PlannedExecutionPlan = {
      ...plan,
      tasks: [
        { ...plan.tasks[0], id: "optional_analysis", required: false },
        { ...plan.tasks[1], dependsOn: ["optional_analysis"], required: true },
      ],
    };
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request: TaskExecutionRequest) =>
        completedResult(
          request.task.id,
          request.task.agentType,
          request.attempt,
        )),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async (): Promise<ReviewResult> => ({
        decision: "fail",
        score: 0,
        findings: [{
          criterion: "complete",
          passed: false,
          severity: "error",
          message: "Not acceptable",
        }],
      })),
    };
    const synthesizer: AnswerSynthesisProvider = {
      synthesize: vi.fn(async () => "unexpected"),
    };
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);
    const events: OrchestrationEvent[] = [];

    await expect(scheduler.run({
      ...createScheduleRequest(events),
      plan: dependencyPlan,
    })).rejects.toThrow("Required task was skipped: review");
    expect(events.map((event) => event.type)).toEqual([
      "task_started",
      "task_reviewed",
      "task_failed",
      "task_skipped",
    ]);
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
  });

  it("fails a task after retry attempts are exhausted", async () => {
    const retryPlan: PlannedExecutionPlan = {
      ...plan,
      tasks: [{ ...plan.tasks[0], maxAttempts: 2 }],
    };
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request: TaskExecutionRequest) =>
        completedResult(
          request.task.id,
          request.task.agentType,
          request.attempt,
        )),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async (): Promise<ReviewResult> => ({
        decision: "retry",
        score: 0.25,
        findings: [{
          criterion: "complete",
          passed: false,
          severity: "warning",
          message: "Still incomplete",
        }],
        retryInstruction: "Try again.",
      })),
    };
    const synthesizer: AnswerSynthesisProvider = {
      synthesize: vi.fn(async () => "unexpected"),
    };
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);
    const events: OrchestrationEvent[] = [];

    await expect(scheduler.run({
      ...createScheduleRequest(events),
      plan: retryPlan,
    })).rejects.toThrow("Required task failed review: analyze");
    expect(runner.runTask).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.type)).toEqual([
      "task_started",
      "task_reviewed",
      "task_retrying",
      "task_started",
      "task_reviewed",
      "task_failed",
    ]);
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
  });
});
