import { describe, expect, it, vi } from "vitest";
import AgentExecutor from "../../src/main/agent/Agent/AgentExecutor.ts";
import { createRootExecutionContext } from "../../src/main/agent/Agent/ExecutionContext.ts";
import type { ModelGateway } from "../../src/main/agent/model/ModelGateway.ts";
import ModelRouter from "../../src/main/agent/model/ModelRouter.ts";

function createGateway(content: string): ModelGateway {
  return {
    stream: async function* () {
      yield content;
    },
    invokeText: vi.fn(async () => content),
  };
}

describe("ModelRouter behavior", () => {
  it("uses the default gateway for omitted and inherit references", () => {
    const defaultGateway = createGateway("default");
    const router = new ModelRouter(defaultGateway);

    expect(router.resolve()).toBe(defaultGateway);
    expect(router.resolve("inherit")).toBe(defaultGateway);
    expect(router.resolve("  inherit  ")).toBe(defaultGateway);
  });

  it("resolves registered named gateways and rejects unknown references", () => {
    const defaultGateway = createGateway("default");
    const specialistGateway = createGateway("specialist");
    const router = new ModelRouter(defaultGateway, [
      { reference: "specialist", gateway: specialistGateway },
    ]);

    expect(router.resolve("specialist")).toBe(specialistGateway);
    expect(() => router.resolve("missing")).toThrow("Unknown model reference: missing");
    expect(() => router.register("inherit", specialistGateway)).toThrow(
      "Reserved model reference cannot be registered: inherit",
    );
  });

  it("lets AgentExecutor select a named gateway for one run", async () => {
    const defaultGateway = createGateway("default");
    const specialistGateway = createGateway("specialist");
    const executor = new AgentExecutor(new ModelRouter(defaultGateway, [
      { reference: "specialist", gateway: specialistGateway },
    ]));

    await expect(executor.execute({
      context: createRootExecutionContext({
        runId: "run-routed-model",
        threadId: "thread-routed-model",
      }),
      prompt: "route me",
      systemPrompt: "system",
      tools: [],
      maxTurns: 2,
      modelReference: "specialist",
      mode: "text",
    })).resolves.toEqual({
      status: "completed",
      content: "specialist",
    });

    expect(specialistGateway.invokeText).toHaveBeenCalledOnce();
    expect(defaultGateway.invokeText).not.toHaveBeenCalled();
  });
});
