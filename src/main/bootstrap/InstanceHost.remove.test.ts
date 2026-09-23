import { describe, expect, it, vi } from "vitest";
import type { InstanceSnapshot } from "../../shared/contracts/instances/contracts.ts";
import InstanceHost from "./InstanceHost.ts";

const readySnapshot = (): InstanceSnapshot => ({
  activeInstanceId: null,
  lastActiveInstanceId: null,
  firstSelectionCompleted: true,
  suggestedRootPath: "E:/suggested",
  instances: [
    {
      id: "inst-1",
      name: "测试",
      rootPath: "E:/workspace/StoryWorkSpace",
      status: "ready",
      lastOpenedAt: null,
    },
  ],
});

function createHost(canClose = true) {
  const shutdown = vi.fn(async () => undefined);
  const removed: string[] = [];
  const host = new InstanceHost(
    {
      get: (id: string) => {
        if (id !== "inst-1") throw new Error(`missing ${id}`);
        return { id, rootPath: "E:/workspace/StoryWorkSpace" };
      },
      markOpened: () => undefined,
    } as never,
    {
      remove: (id: string) => {
        removed.push(id);
      },
      getSnapshot: (activeInstanceId: string | null) => ({
        ...readySnapshot(),
        activeInstanceId,
      }),
    } as never,
    { agentHome: "unused", bundledSkillRoot: "skills" },
    () =>
      ({
        initialize: async () => undefined,
        canClose: () => canClose,
        shutdown,
        subscribe: () => () => undefined,
      }) as never,
  );
  return { host, shutdown, removed };
}

describe("InstanceHost.remove", () => {
  it("closes the active instance before removing it from the list", async () => {
    const { host, shutdown, removed } = createHost();
    await host.open("inst-1");
    const snapshot = await host.remove("inst-1");
    expect(shutdown).toHaveBeenCalledOnce();
    expect(removed).toEqual(["inst-1"]);
    expect(snapshot.activeInstanceId).toBeNull();
  });

  it("keeps a busy instance open and on the list", async () => {
    const { host, shutdown, removed } = createHost(false);
    await host.open("inst-1");
    await expect(host.remove("inst-1")).rejects.toThrow("当前实例仍有任务或数据操作进行中。");
    expect(shutdown).not.toHaveBeenCalled();
    expect(removed).toEqual([]);
    expect(host.getSnapshot().activeInstanceId).toBe("inst-1");
  });
});
