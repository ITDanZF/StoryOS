import { describe, expect, it, vi } from "vitest";
import RunBudget, {
  type RunLimits,
} from "../../src/main/agent/Agent/RunLimits.ts";
import type {
  OrchestrationEvent,
  PlannedExecutionPlan,
} from "../../src/main/agent/Agent/orchestration/contracts.ts";
import type {
  AnswerSynthesisProvider,
  PlannedTaskRunner,
  ResultReviewProvider,
} from "../../src/main/agent/Agent/orchestration/ports.ts";
import TaskScheduler from "../../src/main/agent/Agent/orchestration/TaskScheduler.ts";

const limits: RunLimits = {
  maxTurns: 1,
  maxToolCalls: 20,
  timeoutMs: 0,
  maxDelegationDepth: 1,
  maxSubtasks: 1,
};

const plan: PlannedExecutionPlan = {
  version: 1,
  planId: "budget-plan",
  mode: "planned",
  goal: "complete one task",
  tasks: [{
    id: "task-1",
    title: "Task",
    objective: "Complete the task",
    agentType: "text-analyzer",
    dependsOn: [],
    required: true,
    expectedOutput: "Result",
    acceptanceCriteria: ["complete"],
    sideEffect: "none",
    timeoutMs: 1_000,
    maxAttempts: 1,
  }],
  finalAcceptanceCriteria: ["complete"],
};

function createRequest(events: OrchestrationEvent[]) {
  return {
    runId: "run-budget",
    threadId: "thread-budget",
    goal: plan.goal,
    plan,
    budget: new RunBudget(limits),
    approval: async () => "deny" as const,
    onAgentEvent: (): void => undefined,
    onEvent: (event: OrchestrationEvent): void => {
      events.push(event);
    },
  };
}

function createSynthesizer(): AnswerSynthesisProvider {
  return {
    synthesize: vi.fn(async () => "unexpected"),
  };
}

describe("TaskScheduler budget propagation", () => {
  it("stops immediately when task execution exceeds the model budget", async () => {
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request) => {
        request.budget.consumeModelTurn("task execution");
        request.budget.consumeModelTurn("extra task execution");
        throw new Error("unreachable");
      }),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async () => {
        throw new Error("review should not run");
      }),
    };
    const synthesizer = createSynthesizer();
    const events: OrchestrationEvent[] = [];
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);

    await expect(scheduler.run(createRequest(events))).rejects.toThrow(
      "Model turn budget exceeded before extra task execution",
    );
    expect(reviewer.review).not.toHaveBeenCalled();
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(["task_started"]);
  });

  it("stops immediately when result review exceeds the model budget", async () => {
    const runner: PlannedTaskRunner = {
      runTask: vi.fn(async (request) => {
        request.budget.consumeModelTurn("task execution");
        return {
          status: "completed" as const,
          runId: "agent-task-1",
          agentType: request.task.agentType,
          threadId: "internal-task-1",
          content: "task result",
        };
      }),
    };
    const reviewer: ResultReviewProvider = {
      review: vi.fn(async (request) => {
        request.budget?.consumeModelTurn("result review");
        throw new Error("unreachable");
      }),
    };
    const synthesizer = createSynthesizer();
    const events: OrchestrationEvent[] = [];
    const scheduler = new TaskScheduler(runner, reviewer, synthesizer);

    await expect(scheduler.run(createRequest(events))).rejects.toThrow(
      "Model turn budget exceeded before result review",
    );
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(["task_started"]);
  });
});
