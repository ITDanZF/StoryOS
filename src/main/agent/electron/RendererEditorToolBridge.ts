import { BrowserWindow } from "electron";
import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type {
  RendererEditorToolClient,
  RendererEditorToolOperation,
  RendererEditorToolResponse,
} from "../tools/editor/contracts.ts";

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timeout: NodeJS.Timeout;
};

export default class RendererEditorToolBridge
implements RendererEditorToolClient {
  private readonly pending = new Map<string, PendingRequest>();

  invoke(
    projectId: string,
    operation: RendererEditorToolOperation,
  ): Promise<unknown> {
    const window = BrowserWindow.getFocusedWindow()
      ?? BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!window || window.isDestroyed()) {
      return Promise.reject(new Error("No active StoryOS editor window is available."));
    }
    const requestId = `editor_tool_${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("The active editor did not respond to the tool request."));
      }, 20_000);
      this.pending.set(requestId, { resolve, reject, timeout });
      window.webContents.send(AGENT_IPC_CHANNELS.editorToolRequest, {
        requestId,
        projectId,
        operation,
      });
    });
  }

  acceptResponse(response: RendererEditorToolResponse): void {
    const pending = this.pending.get(response?.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timeout);
    if (response.success) pending.resolve(response.result);
    else pending.reject(new Error(response.error ?? "Editor tool request failed."));
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Editor tool bridge is shutting down."));
    }
    this.pending.clear();
  }
}
