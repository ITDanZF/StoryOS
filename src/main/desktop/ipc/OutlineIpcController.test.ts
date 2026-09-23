import { describe, expect, it, vi } from "vitest";
import { OUTLINE_IPC_CHANNELS } from "../../../shared/contracts/outline/channels.ts";
import OutlineIpcController from "./OutlineIpcController.ts";
import type IpcRegistrar from "./IpcRegistrar.ts";

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

describe("outline ipc", () => {
  it("rejects a missing field before calling the application", () => {
    const calls: unknown[] = [];
    const registrar = {
      handle(channel: string, listener: (value: unknown) => unknown) {
        handlers.set(channel, (_event, value) => listener(value));
      },
    };
    new OutlineIpcController(registrar as unknown as IpcRegistrar, () => ({
      getOutlineSnapshot: () => null,
      createOutline: () => {
        throw new Error("unused");
      },
      updateOutlineProfile: () => {
        throw new Error("unused");
      },
      updateOutlineNode: () => {
        throw new Error("unused");
      },
      proposeOutline: () => {
        throw new Error("unused");
      },
      previewOutlinePatch: () => {
        throw new Error("unused");
      },
      applyOutlinePatch: () => {
        throw new Error("unused");
      },
      runOutlineChecks: (request) => {
        calls.push(request);
        throw new Error("unused");
      },
      buildChapterContext: () => {
        throw new Error("unused");
      },
      markNodesPendingVerification: () => {
        throw new Error("unused");
      },
      reviewChapterCoverage: () => {
        throw new Error("unused");
      },
      loadEventGraphHandoff: () => {
        throw new Error("unused");
      },
      waiveChapterMainline: () => {
        throw new Error("unused");
      },
      startChapterWriting: () => {
        throw new Error("unused");
      },
      mapOutlineNodes: () => {
        throw new Error("unused");
      },
      unmapOutlineNode: () => {
        throw new Error("unused");
      },
    }));
    const check = handlers.get(OUTLINE_IPC_CHANNELS.check);
    expect(() => check?.({}, { projectId: "project-1" })).toThrow();
    expect(() =>
      check?.({}, { projectId: "project-1", bookId: "book-1", includeSemantic: true }),
    ).toThrow("bookId is not accepted.");
    expect(calls).toEqual([]);
  });
});
