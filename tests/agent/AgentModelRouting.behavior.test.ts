import { describe, expect, it, vi } from "vitest";
import AgentExecutor from "../../src/main/agent/Agent/AgentExecutor.ts";
import AgentRegistry from "../../src/main/agent/Agent/AgentRegistry.ts";
import AgentRuntime from "../../src/main/agent/Agent/AgentRuntime.ts";
import type { ModelGateway } from "../../src/main/agent/model/ModelGateway.ts";
import ModelRouter from "../../src/main/agent/model/ModelRouter.ts";
import ToolResolver from "../../src/main/agent/tools/ToolResolver.ts";

function createGateway(content: string): ModelGateway {
  return {
    stream: async function* () {
      yield content;
    },
    invokeText: vi.fn(async () => content),
  };
}

describe("Agent model routing behavior", () => {
  it("uses AgentDefinition.model to select the registered gateway", async () => {
    const defaultGateway = createGateway("default");
    const specialistGateway = createGateway("specialist");
    const router = new ModelRouter(defaultGateway, [
      { reference: "specialist-model", gateway: specialistGateway },
    ]);
    const registry = new AgentRegistry([{
      id: "routed-agent",
      name: "Routed Agent",
      description: "Uses a named model gateway.",
      systemPrompt: "Return the routed result.",
      capabilities: ["text.inspect"],
      allowedToolIds: [],
      allowedEffects: [],
      acceptedContexts: ["global"],
      executionModes: ["planned"],
      outputKinds: ["text"],
      limits: { maxTurns: 3 },
      model: "specialist-model",
    }]);
    const runtime = new AgentRuntime(
      registry,
      defaultGateway,
      new ToolResolver([]),
      undefined,
      undefined,
      new AgentExecutor(router),
    );

    await expect(runtime.run({
      agentType: "routed-agent",
      prompt: "perform routed task",
      parentThreadId: "thread-routing",
      grantedToolIds: [],
    })).resolves.toMatchObject({
      status: "completed",
      content: "specialist",
    });
    expect(specialistGateway.invokeText).toHaveBeenCalledOnce();
    expect(defaultGateway.invokeText).not.toHaveBeenCalled();
  });
});
