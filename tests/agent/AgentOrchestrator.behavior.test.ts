import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentOrchestrator, {
  type DirectAgentRunner,
  type PlanScheduler,
} from "../../src/main/agent/Agent/orchestration/AgentOrchestrator.ts";
import { createAgentOrchestrator } from "../../src/main/agent/Agent/orchestration/createAgentOrchestrator.ts";
import type {
  OrchestrationEvent,
  PlannedExecutionPlan,
} from "../../src/main/agent/Agent/orchestration/contracts.ts";
import type { PlanProvider } from "../../src/main/agent/Agent/orchestration/ports.ts";
import type { AgentModelRunner } from "../../src/main/agent/Agent/AgentRuntime.ts";
import type { RunLimits } from "../../src/main/agent/Agent/RunLimits.ts";
import type Model from "../../src/main/agent/model/Model.ts";
import WorkspaceToolContext from "../../src/main/agent/tools/WorkspaceToolContext.ts";
import AgentRegistry from "../../src/main/agent/Agent/AgentRegistry.ts";
import AgentMatcher from "../../src/main/agent/Agent/orchestration/AgentMatcher.ts";
import RequirementResolver from "../../src/main/agent/Agent/orchestration/RequirementResolver.ts";
import ExecutionRouter from "../../src/main/agent/Agent/orchestration/ExecutionRouter.ts";
import ToolAccessResolver from "../../src/main/agent/tools/ToolAccessResolver.ts";
import ToolRegistry from "../../src/main/agent/tools/ToolRegistry.ts";

const limits: RunLimits = {
  maxTurns: 8,
  maxToolCalls: 20,
  timeoutMs: 0,
  maxDelegationDepth: 1,
};

const roots: string[] = [];

function asModel(model: AgentModelRunner): Model {
  return model as unknown as Model;
}

function createWorkspaceRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-orchestrator-"));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const textReviewRequirements = {
  capabilities: ["text.review" as const],
  effects: [] as const,
  contextKinds: ["global" as const],
  outputKind: "text" as const,
  decomposition: "optional" as const,
};

const plannedPlan: PlannedExecutionPlan = {
  version: 2,
  planId: "plan-planned",
  mode: "planned",
  goal: "analyze and review",
  requirements: textReviewRequirements,
  tasks: [
    {
      id: "analyze",
      title: "Analyze",
      objective: "Analyze the supplied text",
      assignedAgentId: "text-reviewer",
      grantedToolIds: [],
      dependsOn: [],
      required: true,
      expectedOutput: "Analysis",
      acceptanceCriteria: ["Includes the central idea"],
      requirements: textReviewRequirements,
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
  ],
  finalAcceptanceCriteria: ["Provide a concise answer"],
};

function turnInput(content: string) {
  return { message: { messageId: `message-${content}`, content } };
}

function createRouting() {
  const registry = new AgentRegistry([{
    id: "test-specialist",
    name: "Test Specialist",
    description: "Handles read-only test tasks.",
    systemPrompt: "Complete the assigned test task.",
    capabilities: ["text.inspect", "text.review"],
    allowedToolIds: [],
    allowedEffects: [],
    acceptedContexts: ["global"],
    executionModes: ["planned"],
    outputKinds: ["text"],
    limits: { maxTurns: 3 },
  }]);
  const tools = new ToolAccessResolver(new ToolRegistry([]));
  const matcher = new AgentMatcher(registry, tools);
  return {
    requirements: new RequirementResolver(),
    router: new ExecutionRouter(matcher, tools),
  };
}

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
      createPlan: vi.fn(async () => plannedPlan),
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
    const routing = createRouting();
    const orchestrator = new AgentOrchestrator(
      directRunner,
      planner,
      scheduler,
      routing.requirements,
      routing.router,
      limits,
    );
    const events: OrchestrationEvent[] = [];
    const chunks: string[] = [];

    await expect(
      orchestrator.run(turnInput("answer directly"), createOptions(events, chunks)),
    ).resolves.toBe("direct answer");
    expect(directRunner.run).toHaveBeenCalledOnce();
    expect(scheduler.run).not.toHaveBeenCalled();
    expect(chunks).toEqual(["direct answer"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "plan_created",
      plan: expect.objectContaining({
        version: 2,
        mode: "direct",
        goal: "answer directly",
      }),
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
    const routing = createRouting();
    const orchestrator = new AgentOrchestrator(
      directRunner,
      planner,
      scheduler,
      routing.requirements,
      routing.router,
      limits,
    );
    const events: OrchestrationEvent[] = [];
    const chunks: string[] = [];

    await expect(
      orchestrator.run(
        turnInput("analyze and review"),
        createOptions(events, chunks),
      ),
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
      createPlan: vi.fn(async () => plannedPlan),
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
    const routing = createRouting();
    const orchestrator = new AgentOrchestrator(
      directRunner,
      planner,
      scheduler,
      routing.requirements,
      routing.router,
      limits,
    );
    const run = orchestrator.run(
      turnInput("answer directly"),
      createOptions([], []),
    );
    await vi.waitFor(() => expect(directRunStarted).toBe(true));

    const reason = new Error("stop now");
    expect(orchestrator.cancelRun("run-1", reason)).toBe(true);
    await expect(run).rejects.toThrow("stop now");
    expect(directRunner.cancelRun).toHaveBeenCalledWith("run-1", reason);
  });

  it("runs planner, task agent, reviewer, and synthesizer with a fake model", async () => {
    const calls: string[] = [];
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "unexpected";
      },
      invokeText: vi.fn(async (input) => {
        if (input.threadId.includes("/orchestration/planner/")) {
          calls.push("planner");
          return JSON.stringify({
            version: 2,
            mode: "planned",
            goal: "analyze text",
            tasks: [{
              id: "analyze",
              title: "Analyze",
              objective: "Analyze the supplied text",
              dependsOn: [],
              required: true,
              expectedOutput: "Analysis",
              acceptanceCriteria: ["Complete"],
              requirements: {
                capabilities: ["text.inspect"],
                effects: [],
                contextKinds: ["global"],
                outputKind: "text",
                decomposition: "forbidden",
              },
              timeoutMs: 1_000,
              maxAttempts: 1,
            }],
            finalAcceptanceCriteria: ["Return final answer"],
          });
        }
        if (input.threadId.includes("/agents/text-analyzer/")) {
          calls.push("task");
          return "analysis result";
        }
        if (input.threadId.includes("/orchestration/reviewer/")) {
          calls.push("reviewer");
          return JSON.stringify({
            decision: "pass",
            score: 1,
            findings: [{
              criterion: "Complete",
              passed: true,
              severity: "info",
              message: "Complete",
            }],
          });
        }
        if (input.threadId.includes("/orchestration/synthesis/")) {
          calls.push("synthesizer");
          expect(input.prompt).toContain("analysis result");
          return "final answer";
        }
        throw new Error(`Unexpected thread id: ${input.threadId}`);
      }),
    };
    const orchestrator = createAgentOrchestrator({
      model: asModel(model),
      workspaceContext: new WorkspaceToolContext(createWorkspaceRoot()),
      limits,
    });
    const events: OrchestrationEvent[] = [];
    const chunks: string[] = [];

    await expect(orchestrator.run(
      turnInput("analyze text"),
      createOptions(events, chunks),
    )).resolves.toBe("final answer");
    expect(calls).toEqual(["planner", "task", "reviewer", "synthesizer"]);
    expect(chunks).toEqual(["final answer"]);
    expect(events.map((event) => event.type)).toEqual([
      "plan_created",
      "task_started",
      "task_reviewed",
      "task_completed",
      "synthesis_started",
      "synthesis_completed",
    ]);
  });
});
