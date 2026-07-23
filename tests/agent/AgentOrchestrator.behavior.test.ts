import { describe, expect, it, vi } from "vitest";
import AgentOrchestrator, {
  type DirectAgentRunner,
  type PlanScheduler,
} from "../../src/main/agent/Agent/orchestration/AgentOrchestrator.ts";
import type {
  DirectExecutionPlan,
  OrchestrationEvent,
  PlannedExecutionPlan,
} from "../../src/main/agent/Agent/orchestration/contracts.ts";
import type { PlanProvider } from "../../src/main/agent/Agent/orchestration/ports.ts";
import type { RunLimits } from "../../src/main/agent/Agent/RunLimits.ts";

const limits: RunLimits = {
  maxTurns: 8,
  maxToolCalls: 20,
  timeoutMs: 0,
  maxDelegationDepth: 1,
};

const directPlan: DirectExecutionPlan = {
  version: 1,
  planId: "plan-direct",
  mode: "direct",
  goal: "answer directly",
};

const plannedPlan: PlannedExecutionPlan = {
  version: 1,
  planId: "plan-planned",
  mode: "planned",
  goal: "analyze and review",
  tasks: [
    {
      id: "analyze",
      title: "Analyze",
      objective: "Analyze the supplied text",
      agentType: "text-analyzer",
      dependsOn: [],
      required: true,
      expectedOutput: "Analysis",
      acceptanceCriteria: ["Includes the central idea"],
      sideEffect: "none",
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
  ],
  finalAcceptanceCriteria: ["Provide a concise answer"],
};

function createOptions(events: OrchestrationEvent[], chunks: string[]) {
  return {
    runId: "run-1",
    threadId: "thread-1",
    approval: async () => "deny" as const,
    onChunk: (chunk: string) => {
      chunks.push(chunk);
    },
    onAgentEvent: (): void => undefined,
    onOrchestrationEvent: (event: OrchestrationEvent) => {
      events.push(event);
    },
  };
}

describe("AgentOrchestrator behavior", () => {
  it("routes direct plans to the direct runner without invoking the scheduler", async () => {
    const planner: PlanProvider = {
      createPlan: vi.fn(async () => directPlan),
    };
    const directRunner: DirectAgentRunner = {
      run: vi.fn(async (_input, options) => {
        await options.onChunk("direct answer");
        return "direct answer";
      }),
      cancelRun: vi.fn(() => false),
    };
    const scheduler: PlanScheduler = {
      run: vi.fn(async () => "unexpected"),
    };
    const orchestrator = new AgentOrchestrator(
      directRunner,
      planner,
      scheduler,
      limits,
    );
    const events: OrchestrationEvent[] = [];
    const chunks: string[] = [];

    await expect(
      orchestrator.run("answer directly", createOptions(events, chunks)),
    ).resolves.toBe("direct answer");
    expect(directRunner.run).toHaveBeenCalledOnce();
    expect(scheduler.run).not.toHaveBeenCalled();
    expect(chunks).toEqual(["direct answer"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "plan_created",
      plan: directPlan,
    });
  });

  it("routes planned work to the scheduler and emits its synthesized answer once", async () => {
    const planner: PlanProvider = {
      createPlan: vi.fn(async () => plannedPlan),
    };
    const directRunner: DirectAgentRunner = {
      run: vi.fn(async () => "unexpected"),
      cancelRun: vi.fn(() => false),
    };
    const scheduler: PlanScheduler = {
      run: vi.fn(async () => "synthesized answer"),
    };
    const orchestrator = new AgentOrchestrator(
      directRunner,
      planner,
      scheduler,
      limits,
    );
    const events: OrchestrationEvent[] = [];
    const chunks: string[] = [];

    await expect(
      orchestrator.run("analyze and review", createOptions(events, chunks)),
    ).resolves.toBe("synthesized answer");
    expect(directRunner.run).not.toHaveBeenCalled();
    expect(scheduler.run).toHaveBeenCalledOnce();
    expect(scheduler.run).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        threadId: "thread-1",
        goal: "analyze and review",
        plan: plannedPlan,
      }),
    );
    expect(chunks).toEqual(["synthesized answer"]);
  });

  it("forwards cancellation to an active direct run", async () => {
    let rejectRun: (reason: unknown) => void = () => undefined;
    let directRunStarted = false;
    const planner: PlanProvider = {
      createPlan: vi.fn(async () => directPlan),
    };
    const directRunner: DirectAgentRunner = {
      run: () =>
        new Promise<string>((_resolve, reject) => {
          directRunStarted = true;
          rejectRun = reject;
        }),
      cancelRun: vi.fn((_runId, reason) => {
        rejectRun(reason);
        return true;
      }),
    };
    const scheduler: PlanScheduler = {
      run: vi.fn(async () => "unexpected"),
    };
    const orchestrator = new AgentOrchestrator(
      directRunner,
      planner,
      scheduler,
      limits,
    );
    const run = orchestrator.run("answer directly", createOptions([], []));
    await vi.waitFor(() => expect(directRunStarted).toBe(true));

    const reason = new Error("stop now");
    expect(orchestrator.cancelRun("run-1", reason)).toBe(true);
    await expect(run).rejects.toThrow("stop now");
    expect(directRunner.cancelRun).toHaveBeenCalledWith("run-1", reason);
  });
});
