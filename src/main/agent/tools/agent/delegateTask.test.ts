import { describe, expect, it, vi } from "vitest";
import AgentRegistry from "../../runtime/AgentRegistry.ts";
import RunBudget, { DEFAULT_RUN_LIMITS } from "../../runtime/RunLimits.ts";
import { createDelegateTaskTool, type DelegateAgentRuntime } from "./delegateTask.ts";

function rejectChapterWriter(subagentType: string): string | null {
  if (subagentType === "chapter-writer") {
    return "章节写作只能由已经完成的事件图交接启动。";
  }
  return null;
}

function delegate(runtime: DelegateAgentRuntime, reject = rejectChapterWriter) {
  return createDelegateTaskTool(runtime, new AgentRegistry([]), {
    parentThreadId: "thread_1",
    parentRunId: "run_1",
    parentDepth: 0,
    budget: new RunBudget(DEFAULT_RUN_LIMITS),
    rejectDelegation: reject,
  });
}

describe("delegate_task chapter writer gate", () => {
  it("rejects chapter-writer before looking up or running the agent", async () => {
    const runtime: DelegateAgentRuntime = { run: vi.fn() };
    const tool = delegate(runtime);
    const result = await tool.invoke({
      subagent_type: "chapter-writer",
      description: "写本章",
      prompt: "按主线写",
    });
    expect(result).toContain("Subagent delegation rejected.");
    expect(result).toContain("章节写作只能由已经完成的事件图交接启动。");
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it("still allows event-graph delegation", async () => {
    const runtime: DelegateAgentRuntime = {
      run: vi.fn(async () => ({
        status: "completed" as const,
        runId: "child",
        agentType: "event-graph",
        threadId: "thread_child",
        content: "候选",
      })),
    };
    const registry = {
      list: () => [{ id: "event-graph", description: "事件图" }],
      get: () => ({
        id: "event-graph",
        allowedToolIds: ["get_narrative_outline"],
      }),
    };
    const tool = createDelegateTaskTool(runtime, registry as unknown as AgentRegistry, {
      parentThreadId: "thread_1",
      parentRunId: "run_1",
      parentDepth: 0,
      budget: new RunBudget(DEFAULT_RUN_LIMITS),
      rejectDelegation: rejectChapterWriter,
    });
    const result = await tool.invoke({
      subagent_type: "event-graph",
      description: "展开",
      prompt: "展开一层",
    });
    expect(result).toContain("Subagent completed.");
    expect(runtime.run).toHaveBeenCalledOnce();
  });
});
