import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (event: unknown, ...args: unknown[]) => unknown>());

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  },
}));

describe("ipc registrar", () => {
  it("rejects an untrusted frame before the outline listener runs", async () => {
    const { default: IpcRegistrar } = await import("./IpcRegistrar.ts");
    let ran = false;
    const registrar = new IpcRegistrar(
      () => ({
        runBusinessRequest: (run) => Promise.resolve(run()),
      }),
      () => false,
    );
    registrar.handle("outline:snapshot", () => {
      ran = true;
      return "ok";
    });
    const frame = {};
    expect(() =>
      handlers.get("outline:snapshot")?.(
        {
          senderFrame: frame,
          sender: { id: 4, mainFrame: frame, once: vi.fn(), removeListener: vi.fn() },
        },
        "project-1",
      ),
    ).toThrow("Untrusted application frame.");
    expect(ran).toBe(false);
    registrar.dispose();
  });
});
