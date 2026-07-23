import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../src/main/agent/Agent/AgentEvent.ts";
import AgentGenerator from "../../src/main/agent/Agent/AgentGenerator.ts";
import type { AgentModelRunner } from "../../src/main/agent/Agent/AgentRuntime.ts";
import type { RunLimits } from "../../src/main/agent/Agent/RunLimits.ts";
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
});
