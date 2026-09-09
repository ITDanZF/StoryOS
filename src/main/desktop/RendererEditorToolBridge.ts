import { BrowserWindow } from "electron";
import { currentRequestOwner } from "../bootstrap/RequestContext.ts";
import { AGENT_IPC_CHANNELS } from "../../shared/agent/contracts.ts";
import type {
  RendererEditorToolClient,
  RendererEditorToolOperation,
  RendererEditorToolResponse,
} from "../story/integration/tools/editor/contracts.ts";

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timeout: NodeJS.Timeout;
  readonly owner: number;
  readonly detach: () => void;
};

export default class RendererEditorToolBridge implements RendererEditorToolClient {
  private readonly pending = new Map<string, PendingRequest>();
  private closed = false;
  constructor(private readonly trusted: (id: number) => boolean = () => false) {}

  invoke(projectId: string, operation: RendererEditorToolOperation): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Editor tool bridge is shutting down."));
    const owner = currentRequestOwner();
    const focused = BrowserWindow.getFocusedWindow();
    const available = BrowserWindow.getAllWindows().filter(
      (candidate) => !candidate.isDestroyed() && this.trusted(candidate.webContents.id),
    );
    const window =
      owner !== undefined
        ? available.find((candidate) => candidate.webContents.id === owner)
        : (available.find((candidate) => candidate === focused) ?? available[0]);
    if (!window || window.isDestroyed()) {
      return Promise.reject(new Error("No active StoryOS editor window is available."));
    }
    const requestId = `editor_tool_${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.get(requestId)?.detach();
        this.pending.delete(requestId);
        reject(new Error("The active editor did not respond to the tool request."));
      }, 20_000);
      const onClosed = () => {
        this.finish(requestId);
        reject(new Error("Editor window closed."));
      };
      window.webContents.once("destroyed", onClosed);
      this.pending.set(requestId, {
        resolve,
        reject,
        timeout,
        owner: window.webContents.id,
        detach: () => window.webContents.removeListener("destroyed", onClosed),
      });
      try {
        window.webContents.send(AGENT_IPC_CHANNELS.editorToolRequest, {
          requestId,
          projectId,
          operation,
        });
      } catch (error) {
        this.finish(requestId);
        reject(error);
      }
    });
  }

  acceptResponse(response: RendererEditorToolResponse, owner: number): void {
    const pending = this.pending.get(response?.requestId);
    if (!pending || pending.owner !== owner) return;
    this.finish(response.requestId);
    if (response.success) pending.resolve(response.result);
    else pending.reject(new Error(response.error ?? "Editor tool request failed."));
  }

  close(): void {
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.detach();
      clearTimeout(pending.timeout);
      pending.reject(new Error("Editor tool bridge is shutting down."));
    }
    this.pending.clear();
  }
  private finish(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    pending.detach();
  }
}
