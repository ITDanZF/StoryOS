import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/main/agent/Agent/AgentEvent.ts";
import AgentGenerator from "../../src/main/agent/Agent/AgentGenerator.ts";
import AgentRegistry from "../../src/main/agent/Agent/AgentRegistry.ts";
import type { AgentModelRunner } from "../../src/main/agent/Agent/AgentRuntime.ts";
import type { RunLimits } from "../../src/main/agent/Agent/RunLimits.ts";
import type { ModelRunInput } from "../../src/main/agent/model/ModelGateway.ts";
import type Model from "../../src/main/agent/model/Model.ts";
import ToolResolver from "../../src/main/agent/tools/ToolResolver.ts";

const limits: RunLimits = {
  maxTurns: 4,
  maxToolCalls: 10,
  timeoutMs: 0,
  maxDelegationDepth: 1,
};

function asModel(model: AgentModelRunner): Model {
  return model as unknown as Model;
}

describe("AgentGenerator behavior", () => {
  it("preserves root streaming and completion events through AgentExecutor", async () => {
    const generator = new AgentGenerator({
      model: asModel({
        stream: async function* () {
          yield "root ";
          yield "answer";
        },
      }),
      toolResolver: new ToolResolver([]),
      limits,
    });
    const events: AgentEvent[] = [];
    const chunks: string[] = [];

    await expect(generator.run("answer", {
      runId: "root-run",
      threadId: "thread-1",
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
      onAgentEvent: (event) => {
        events.push(event);
      },
    })).resolves.toBe("root answer");
    expect(chunks).toEqual(["root ", "answer"]);
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "text_delta",
      "run_completed",
    ]);
  });

  it("preserves root failure propagation with a single failure event", async () => {
    const generator = new AgentGenerator({
      model: asModel({
        stream: async function* () {
          yield "partial";
          throw new Error("root failed");
        },
      }),
      toolResolver: new ToolResolver([]),
      limits,
    });
    const events: AgentEvent[] = [];

    await expect(generator.run("answer", {
      runId: "root-failure",
      threadId: "thread-1",
      onAgentEvent: (event) => {
        events.push(event);
      },
    })).rejects.toThrow("root failed");
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_failed",
    ]);
  });

  it("runs a delegated subagent task through the main agent tool list", async () => {
    const model: AgentModelRunner = {
      stream: vi.fn(async function* (input: ModelRunInput) {
        const delegateTask = input.tools.find((item) => item.name === "delegate_task");
        if (!delegateTask) throw new Error("delegate_task missing");
        yield await delegateTask.invoke({
          subagent_type: "text-analyzer",
          description: "Analyze a paragraph",
          prompt: "Extract the central idea.",
        });
      }),
      invokeText: vi.fn(async (input) => {
        expect(input.threadId).toContain("thread-1/agents/text-analyzer/run_");
        expect(input.prompt).toBe("Extract the central idea.");
        return "specialist result";
      }),
    };
    const generator = new AgentGenerator({
      model: asModel(model),
      registry: new AgentRegistry([{
        id: "text-analyzer",
        name: "Text Analyzer",
        description: "Analyze text.",
        systemPrompt: "Analyze text.",
        tools: [],
        maxTurns: 3,
      }]),
      toolResolver: new ToolResolver([]),
      limits,
    });
    const events: AgentEvent[] = [];

    await expect(generator.run("delegate this", {
      runId: "root-run",
      threadId: "thread-1",
      onAgentEvent: (event) => {
        events.push(event);
      },
    })).resolves.toContain("specialist result");
    expect(model.stream).toHaveBeenCalledOnce();
    expect(model.invokeText).toHaveBeenCalledOnce();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "run_started", agentType: "main" }),
      expect.objectContaining({ type: "run_started", agentType: "text-analyzer" }),
      expect.objectContaining({ type: "run_completed", agentType: "text-analyzer" }),
      expect.objectContaining({ type: "run_completed", agentType: "main" }),
    ]));
  });
});
