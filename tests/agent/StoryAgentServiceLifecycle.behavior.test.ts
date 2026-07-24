import { describe, expect, it, vi } from "vitest";
import StoryAgentService from "../../src/main/agent/StoryAgentService.ts";
import type { ApplicationEventHandler } from "../../src/main/agent/application/contracts.ts";
import type DesktopController from "../../src/main/agent/electron/DesktopController.ts";

type MutableServiceState = {
  controller: DesktopController | null;
  runtimeInitialization: Promise<void> | null;
  readonly controllerUnsubscribers: Map<ApplicationEventHandler, () => void>;
  readonly subscribers: Set<ApplicationEventHandler>;
};

describe("StoryAgentService lifecycle behavior", () => {
  it("unsubscribes listeners and shuts down its controller only once", async () => {
    const service = new StoryAgentService({
      agentHome: "test-agent-home",
      bundledSkillRoot: "test-skills",
    });
    const state = service as unknown as MutableServiceState;
    const shutdown = vi.fn(async () => undefined);
    const unsubscribe = vi.fn();
    const handler: ApplicationEventHandler = () => undefined;
    state.controller = { shutdown } as unknown as DesktopController;
    state.subscribers.add(handler);
    state.controllerUnsubscribers.set(handler, unsubscribe);

    await service.shutdown();
    await service.shutdown();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(state.controller).toBeNull();
    expect(state.subscribers.size).toBe(0);
    expect(state.controllerUnsubscribers.size).toBe(0);
  });
  it("waits for runtime initialization before releasing the controller", async () => {
    const service = new StoryAgentService({
      agentHome: "test-agent-home",
      bundledSkillRoot: "test-skills",
    });
    const state = service as unknown as MutableServiceState;
    let finishInitialization: () => void = () => undefined;
    state.runtimeInitialization = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });
    const shutdown = vi.fn(async () => undefined);
    state.controller = { shutdown } as unknown as DesktopController;

    const closing = service.shutdown();
    await Promise.resolve();
    expect(shutdown).not.toHaveBeenCalled();

    finishInitialization();
    await closing;

    expect(shutdown).toHaveBeenCalledOnce();
  });

});
