import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/main/agent/Agent/AgentEvent.ts";
import AgentRegistry from "../../src/main/agent/Agent/AgentRegistry.ts";
import AgentRuntime, {
  type AgentModelRunner,
} from "../../src/main/agent/Agent/AgentRuntime.ts";
import RunBudget from "../../src/main/agent/Agent/RunLimits.ts";
import type { ModelRunInput } from "../../src/main/agent/model/ModelGateway.ts";
import ToolResolver from "../../src/main/agent/tools/ToolResolver.ts";
import { tool } from "langchain";
import { z } from "zod";

function createRegistry() {
  return new AgentRegistry([
    {
      id: "test-agent",
      name: "Test Agent",
      description: "Agent used by runtime behavior tests.",
      systemPrompt: "Return the test result.",
      tools: [],
      maxTurns: 3,
    },
  ]);
}

function createTool(name: string) {
  return tool(async () => `${name} result`, {
    name,
    description: `${name} test tool`,
    schema: z.object({}),
  });
}

describe("AgentRuntime behavior", () => {
  it("maps executor completion back to the existing subagent result contract", async () => {
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "fallback";
      },
      invokeText: vi.fn(async () => "subagent result"),
    };
    const runtime = new AgentRuntime(
      createRegistry(),
      model,
      new ToolResolver([]),
    );
    const events: AgentEvent[] = [];

    const result = await runtime.run({
      agentType: "test-agent",
      prompt: "perform task",
      parentThreadId: "thread-1",
      parentRunId: "root-run",
      depth: 1,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      agentType: "test-agent",
      content: "subagent result",
    });
    expect(result.threadId).toContain("thread-1/agents/test-agent/");
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_completed",
    ]);
  });

  it("preserves the aborted subagent result contract", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const invokeText = vi.fn(async () => "unexpected");
    const runtime = new AgentRuntime(
      createRegistry(),
      {
        stream: async function* () {
          yield "unexpected";
        },
        invokeText,
      },
      new ToolResolver([]),
    );
    const events: AgentEvent[] = [];

    const result = await runtime.run({
      agentType: "test-agent",
      prompt: "perform task",
      parentThreadId: "thread-1",
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(result).toMatchObject({
      status: "aborted",
      agentType: "test-agent",
      partialContent: "",
    });
    expect(invokeText).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "run_aborted",
    ]);
  });

  it("preserves failed subagent results instead of throwing model errors", async () => {
    const runtime = new AgentRuntime(
      createRegistry(),
      {
        stream: async function* () {
          yield "fallback";
        },
        invokeText: async () => {
          throw new Error("model failed");
        },
      },
      new ToolResolver([]),
    );

    await expect(runtime.run({
      agentType: "test-agent",
      prompt: "perform task",
      parentThreadId: "thread-1",
    })).resolves.toMatchObject({
      status: "failed",
      agentType: "test-agent",
      partialContent: "",
      error: "model failed",
    });
  });

  it("uses isolated model thread ids for parallel subagents", async () => {
    const prompts: string[] = [];
    const threadIds: string[] = [];
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "fallback";
      },
      invokeText: vi.fn(async (input) => {
        prompts.push(input.prompt);
        threadIds.push(input.threadId);
        return `result for ${input.threadId}`;
      }),
    };
    const runtime = new AgentRuntime(
      createRegistry(),
      model,
      new ToolResolver([]),
    );
    const events: AgentEvent[] = [];

    const [first, second] = await Promise.all([
      runtime.run({
        agentType: "test-agent",
        prompt: "task A explicit context",
        parentThreadId: "thread-parent",
        parentRunId: "root-run",
        depth: 1,
        onEvent: (event) => {
          events.push(event);
        },
      }),
      runtime.run({
        agentType: "test-agent",
        prompt: "task B explicit context",
        parentThreadId: "thread-parent",
        parentRunId: "root-run",
        depth: 1,
        onEvent: (event) => {
          events.push(event);
        },
      }),
    ]);

    expect(first.threadId).not.toBe(second.threadId);
    expect(threadIds).toHaveLength(2);
    expect(new Set(threadIds).size).toBe(2);
    expect(threadIds.every((threadId) => threadId.startsWith("thread-parent/agents/test-agent/run_"))).toBe(true);
    expect(prompts).toEqual(expect.arrayContaining([
      "task A explicit context",
      "task B explicit context",
    ]));
    expect(events.filter((event) => event.type === "run_started")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentType: "test-agent",
          parentRunId: "root-run",
          threadId: first.threadId,
        }),
        expect.objectContaining({
          agentType: "test-agent",
          parentRunId: "root-run",
          threadId: second.threadId,
        }),
      ]),
    );
  });

  it("enforces a shared model turn budget across subagent runs", async () => {
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "fallback";
      },
      invokeText: vi.fn(async () => "ok"),
    };
    const runtime = new AgentRuntime(
      createRegistry(),
      model,
      new ToolResolver([]),
    );
    const budget = new RunBudget({
      maxTurns: 1,
      maxToolCalls: 10,
      timeoutMs: 0,
      maxDelegationDepth: 1,
    });

    await expect(runtime.run({
      agentType: "test-agent",
      prompt: "first task",
      parentThreadId: "thread-1",
      budget,
    })).resolves.toMatchObject({ status: "completed" });
    await expect(runtime.run({
      agentType: "test-agent",
      prompt: "second task",
      parentThreadId: "thread-1",
      budget,
    })).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("Model turn budget exceeded"),
    });
    expect(model.invokeText).toHaveBeenCalledOnce();
  });

  it("passes only the tools declared by the subagent definition", async () => {
    const registry = new AgentRegistry([
      {
        id: "read-only-agent",
        name: "Read Only Agent",
        description: "Uses only read tools.",
        systemPrompt: "Read only.",
        tools: ["read_file"],
        maxTurns: 3,
      },
    ]);
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "fallback";
      },
      invokeText: vi.fn(async (input: ModelRunInput) => {
        expect(input.tools.map((item) => item.name)).toEqual(["read_file"]);
        return "ok";
      }),
    };
    const runtime = new AgentRuntime(
      registry,
      model,
      new ToolResolver([createTool("read_file"), createTool("write_file")]),
    );

    await expect(runtime.run({
      agentType: "read-only-agent",
      prompt: "read something",
      parentThreadId: "thread-1",
    })).resolves.toMatchObject({ status: "completed" });
    expect(model.invokeText).toHaveBeenCalledOnce();
  });
});
