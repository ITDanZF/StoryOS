import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import RendererEditorToolBridge from "../../src/main/desktop/RendererEditorToolBridge.ts";
import { requestContext } from "../../src/main/bootstrap/RequestContext.ts";
const windows = vi.hoisted(() => ({ all: vi.fn(), focused: vi.fn() }));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: windows.all, getFocusedWindow: windows.focused },
}));
function window(id: number) {
  return {
    isDestroyed: () => false,
    webContents: Object.assign(new EventEmitter(), { id, send: vi.fn() }),
  };
}
describe("editor request ownership", () => {
  it("routes to the originating window and rejects responses from another window", async () => {
    const source = window(1),
      focused = window(2);
    windows.all.mockReturnValue([source, focused]);
    windows.focused.mockReturnValue(focused);
    const bridge = new RendererEditorToolBridge(() => true);
    const result = requestContext.run({ ownerId: 1, requestId: "request" }, () =>
      bridge.invoke("project", { kind: "get_context" }),
    );
    const request = source.webContents.send.mock.calls[0][1];
    expect(focused.webContents.send).not.toHaveBeenCalled();
    bridge.acceptResponse({ requestId: request.requestId, success: true, result: "foreign" }, 2);
    bridge.acceptResponse({ requestId: request.requestId, success: true, result: "owned" }, 1);
    expect(await result).toBe("owned");
    expect(source.webContents.listenerCount("destroyed")).toBe(0);
    bridge.close();
  });
  it("rejects waiting requests immediately on window destruction and on shutdown", async () => {
    const source = window(1);
    windows.all.mockReturnValue([source]);
    windows.focused.mockReturnValue(source);
    const bridge = new RendererEditorToolBridge(() => true);
    const first = bridge.invoke("project", { kind: "get_context" });
    const failure = expect(first).rejects.toThrow("window closed");
    source.webContents.emit("destroyed");
    await failure;
    const second = bridge.invoke("project", { kind: "get_context" });
    const closing = expect(second).rejects.toThrow("shutting down");
    bridge.close();
    await closing;
    await expect(bridge.invoke("project", { kind: "get_context" })).rejects.toThrow(
      "shutting down",
    );
  });
});
