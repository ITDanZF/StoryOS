import { EventEmitter } from "node:events";
import {
  mkdtempSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  currentApplicationEnvironment,
  withApplicationEnvironment,
} from "../../src/main/agent/environment/AgentEnvironment.ts";
import { currentRequestOwner } from "../../src/main/bootstrap/RequestContext.ts";
import PreviewStagingDirectory from "../../src/main/story/application/transfers/PreviewStagingDirectory.ts";
import IpcRegistrar from "../../src/main/desktop/ipc/IpcRegistrar.ts";

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: ipc }));

describe("backend isolation boundaries", () => {
  it("keeps concurrent application environments independent across awaits", async () => {
    const read = (id: string) =>
      withApplicationEnvironment(
        { agentHome: id, bundledSkillRoot: id },
        async () => {
          await Promise.resolve();
          return currentApplicationEnvironment()?.agentHome;
        },
      );
    expect(await Promise.all([read("first"), read("second")])).toEqual([
      "first",
      "second",
    ]);
    expect(currentApplicationEnvironment()).toBeUndefined();
  });

  it("rejects foreign windows and subframes, carries ownership and unregisters cleanly", async () => {
    const sender = Object.assign(new EventEmitter(), { id: 42, mainFrame: {} });
    const closeBookReaders = vi.fn();
    const registrar = new IpcRegistrar(
      () => ({
        runBusinessRequest: async <T>(run: () => T | Promise<T>) => run(),
        closeBookReaders,
      }),
      (id) => id === 42,
    );
    registrar.handle("test:owned", async () => {
      await Promise.resolve();
      return currentRequestOwner();
    });
    const invoke = ipc.handle.mock.calls.at(-1)[1];
    expect(() => invoke({ sender, senderFrame: {} })).toThrow("Untrusted");
    expect(() =>
      invoke({
        sender: { id: 7, mainFrame: sender.mainFrame },
        senderFrame: sender.mainFrame,
      }),
    ).toThrow("Untrusted");
    expect(await invoke({ sender, senderFrame: sender.mainFrame })).toBe(42);
    sender.emit("destroyed");
    expect(closeBookReaders).toHaveBeenCalledWith(42);
    registrar.dispose();
    registrar.dispose();
    expect(
      ipc.removeHandler.mock.calls.filter(
        ([channel]) => channel === "test:owned",
      ),
    ).toHaveLength(1);
  });

  it("recovers marked dead-process previews while preserving live and unknown directories", () => {
    const home = mkdtempSync(path.join(tmpdir(), "storyos-preview-ownership-"));
    try {
      const staging = new PreviewStagingDirectory(
        home,
        (pid) => pid === process.pid,
      );
      const dead = staging.create("book_import_preview_dead");
      writeFileSync(
        path.join(dead, ".preview-owner.json"),
        JSON.stringify({ version: 1, pid: process.pid + 1 }),
      );
      const live = staging.create("book_import_preview_live");
      const unknown = path.join(staging.root, "book_import_preview_unknown");
      mkdirSync(unknown);
      staging.recover();
      expect(existsSync(dead)).toBe(false);
      expect(existsSync(live)).toBe(true);
      expect(existsSync(unknown)).toBe(true);
      expect(() => staging.remove("../outside")).toThrow("Invalid");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
