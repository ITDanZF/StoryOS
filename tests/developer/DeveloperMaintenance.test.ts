import { afterEach, describe, expect, it, vi } from "vitest";
import StoryAgentService from "../../src/main/bootstrap/StoryAgentService.ts";
import type DesktopController from "../../src/main/desktop/DesktopController.ts";

afterEach(() => vi.unstubAllEnvs());
function createService() {
  vi.stubEnv("MINI_AGENT_HOME", "test-home");
  vi.stubEnv("MINI_AGENT_BUNDLED_SKILLS", "test-skills");
  const service = new StoryAgentService({ agentHome: "test-home", bundledSkillRoot: "test-skills" });
  const state = service as unknown as { controller: DesktopController; subscribers: Set<unknown> };
  const close = vi.fn(async () => undefined);
  const hasActiveRun = vi.fn(() => false);
  state.controller = {
    closeForDeveloper: close,
    hasActiveRun,
    subscribe: () => (): void => undefined,
  } as unknown as DesktopController;
  return { service, state, close, hasActiveRun };
}
describe("business maintenance gate", () => {
  it("rejects entry while an IPC request is in flight and releases the gate on failure", async () => {
    const { service, close } = createService();
    let finish: () => void;
    const pending = service.runBusinessRequest(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await expect(service.pauseForDeveloper()).rejects.toThrow("进行中");
    expect(close).not.toHaveBeenCalled();
    finish();
    await pending;
    await expect(
      service.runBusinessRequest(() => {
        throw new Error("request failed");
      }),
    ).rejects.toThrow("request failed");
    await service.pauseForDeveloper();
    expect(close).toHaveBeenCalledOnce();
    await expect(service.runBusinessRequest(() => 1)).rejects.toThrow("已暂停");
  });
  it("blocks new requests synchronously during closure and preserves subscribers for resume", async () => {
    const { service, close, state } = createService();
    service.subscribe(() => undefined);
    const pending = service.pauseForDeveloper();
    await expect(service.runBusinessRequest(() => 1)).rejects.toThrow("已暂停");
    await pending;
    expect(close).toHaveBeenCalledOnce();
    expect(state.subscribers.size).toBe(1);
    await service.resumeFromDeveloper();
    expect(await service.runBusinessRequest(() => 2)).toBe(2);
  });
  it("does not interrupt running AI tasks", async () => {
    const { service, close, hasActiveRun } = createService();
    hasActiveRun.mockReturnValue(true);
    await expect(service.pauseForDeveloper()).rejects.toThrow("进行中");
    expect(close).not.toHaveBeenCalled();
    expect(await service.runBusinessRequest(() => 1)).toBe(1);
  });
});
