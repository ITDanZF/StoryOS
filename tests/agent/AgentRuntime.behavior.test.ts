import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/main/agent/Agent/AgentEvent.ts";
import AgentRegistry from "../../src/main/agent/Agent/AgentRegistry.ts";
import AgentRuntime, {
  type AgentModelRunner,
} from "../../src/main/agent/Agent/AgentRuntime.ts";
import ToolResolver from "../../src/main/agent/tools/ToolResolver.ts";

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
});
