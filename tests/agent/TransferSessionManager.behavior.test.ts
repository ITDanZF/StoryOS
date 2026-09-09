import { describe, expect, it, vi } from "vitest";
import TransferSessionManager from "../../src/main/story/application/transfers/TransferSessionManager.ts";

describe("transfer session ownership", () => {
  it("claims a preview only once and refuses a different owner", async () => {
    let owner = 1;
    const sessions = new TransferSessionManager<string>({ owner: () => owner });
    const cleanup = vi.fn();
    sessions.reserve("preview", cleanup);
    sessions.set("preview", "snapshot");
    owner = 2;
    expect(() => sessions.claim("preview")).toThrow("another window");
    owner = 1;
    expect(sessions.claim("preview")).toBe("snapshot");
    expect(() => sessions.claim("preview")).toThrow("busy");
    sessions.closeOwner(1);
    expect(cleanup).not.toHaveBeenCalled();
    const closing = sessions.close();
    sessions.finish("preview");
    await closing;
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("expires prepared previews but preserves in-flight work", async () => {
    let now = 0;
    const sessions = new TransferSessionManager<string>({ now: () => now, ttlMs: 10 });
    sessions.set("old", "old");
    sessions.set("active", "active");
    sessions.claim("active");
    now = 11;
    expect(() => sessions.claim("old")).toThrow("expired");
    expect(sessions.busy).toBe(true);
    sessions.finish("active");
    await sessions.close();
  });
});
