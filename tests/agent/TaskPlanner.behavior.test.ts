import { describe, expect, it, vi } from "vitest";
import { createBuiltInAgentRegistry } from "../../src/main/agent/runtime/builtInAgents.ts";
import AgentMatcher from "../../src/main/agent/orchestration/AgentMatcher.ts";
import ExecutionRouter from "../../src/main/agent/orchestration/ExecutionRouter.ts";
import PlanValidator from "../../src/main/agent/orchestration/PlanValidator.ts";
import RequirementResolver from "../../src/main/story/integration/StoryRequirementResolver.ts";
import TaskPlanner from "../../src/main/agent/orchestration/TaskPlanner.ts";
import type { OrchestrationTextModel } from "../../src/main/agent/orchestration/ports.ts";
import ToolAccessResolver from "../../src/main/agent/tools/ToolAccessResolver.ts";
import ToolResolver from "../../src/main/story/integration/StoryToolResolver.ts";
import type { AgentTurnInput } from "../../src/shared/contracts/conversations/applicationContracts.ts";

function createPlatform() {
  const agents = createBuiltInAgentRegistry();
  const tools = new ToolResolver();
  const access = new ToolAccessResolver(tools.registry);
  const matcher = new AgentMatcher(agents, access);
  return {
    matcher,
    requirements: new RequirementResolver(),
    router: new ExecutionRouter(matcher, access),
    validator: new PlanValidator(agents, tools.registry),
  };
}

describe("TaskPlanner behavior", () => {
  it("routes a chapter-writing request directly from structured context", () => {
    const platform = createPlatform();
    const input: AgentTurnInput = {
      message: { messageId: "message-1", content: "帮我完成第三章的内容" },
      context: {
        kind: "book_editor" as const,
        projectId: "project-1",
        projectName: "test",
        book: { id: "book-1", title: "我的凯旋" },
        chapter: null,
      },
    };
    const requirements = platform.requirements.resolve(input);

    expect(requirements.effects).toEqual(["book.write"]);
    expect(platform.router.decide(requirements)).toBe("direct");
    expect(platform.router.createDirectPlan(input, requirements)).toMatchObject({
      version: 2,
      mode: "direct",
      goal: "帮我完成第三章的内容",
      requirements: { effects: ["book.write"] },
    });
  });

  it("assigns a planned task by capability instead of planner-selected agent id", async () => {
    const platform = createPlatform();
    const model: OrchestrationTextModel = {
      invokeText: vi.fn(async () =>
        JSON.stringify({
          version: 2,
          mode: "planned",
          goal: "分析这段文本",
          tasks: [
            {
              id: "analyze",
              title: "分析文本",
              objective: "分析用户提供的文本",
              dependsOn: [],
              required: true,
              expectedOutput: "分析结果",
              acceptanceCriteria: ["说明主要信息"],
              requirements: {
                capabilities: ["text.inspect"],
                effects: [],
                contextKinds: ["global"],
                outputKind: "text",
                decomposition: "forbidden",
              },
              timeoutMs: 30_000,
              maxAttempts: 1,
            },
          ],
          finalAcceptanceCriteria: ["回答清晰"],
        }),
      ),
    };
    const planner = new TaskPlanner(model, platform.matcher, platform.validator);
    const input = {
      message: { messageId: "message-2", content: "分析这段文本" },
    };
    const requirements = platform.requirements.resolve(input);

    await expect(
      planner.createPlan({
        runId: "run-2",
        threadId: "thread-2",
        input,
        requirements,
      }),
    ).resolves.toMatchObject({
      mode: "planned",
      tasks: [{ assignedAgentId: "text-analyzer" }],
    });
    expect(model.invokeText).toHaveBeenCalledOnce();
  });
});
