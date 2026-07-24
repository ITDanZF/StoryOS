import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApplicationEvent } from "../../src/main/agent/application/contracts.ts";
import RunLogStore from "../../src/main/agent/runtime/RunLogStore.ts";

const roots: string[] = [];

async function createStore(options?: {
  readonly maxSegmentBytes?: number;
  readonly maxRunLogs?: number;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "storyos-run-logs-"));
  roots.push(root);
  return {
    root,
    store: new RunLogStore(root, options),
  };
}

function started(
  runId: string,
  threadId: string,
  timestamp: string,
): ApplicationEvent {
  return { type: "run_started", runId, threadId, timestamp };
}

function completed(
  runId: string,
  timestamp: string,
): ApplicationEvent {
  return {
    type: "run_completed",
    runId,
    content: "sensitive answer",
    durationMs: 25,
    timestamp,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe("RunLogStore behavior", () => {
  it("restores completed and interrupted runs while isolating damaged lines", async () => {
    const { root, store } = await createStore();
    await store.record(started("run-complete", "thread-1", "2026-01-01T00:00:00.000Z"));
    await store.record(completed("run-complete", "2026-01-01T00:00:00.025Z"));
    await store.record(started("run-interrupted", "thread-2", "2026-01-02T00:00:00.000Z"));
    await store.flush();
    await writeFile(
      path.join(root, "damaged.jsonl"),
      "{not-json}\n",
      "utf-8",
    );

    const snapshots = await store.loadRunSnapshots();

    expect(snapshots).toEqual([
      expect.objectContaining({
        runId: "run-interrupted",
        threadId: "thread-2",
        status: "aborted",
        error: expect.objectContaining({ name: "RunInterruptedError" }),
      }),
      expect.objectContaining({
        runId: "run-complete",
        threadId: "thread-1",
        status: "completed",
        durationMs: 25,
      }),
    ]);
    expect(snapshots[1]).not.toHaveProperty("content");
    await store.close();
  });

  it("rotates oversized run logs and reconstructs all segments", async () => {
    const { root, store } = await createStore({ maxSegmentBytes: 100 });
    await store.record(started("run-rotate", "thread-rotate", "2026-01-01T00:00:00.000Z"));
    await store.record({
      type: "tool_status",
      runId: "run-rotate",
      toolName: "read_file",
      summary: "A".repeat(120),
      status: "completed",
      timestamp: "2026-01-01T00:00:00.010Z",
    });
    await store.record(completed("run-rotate", "2026-01-01T00:00:00.025Z"));

    const files = (await readdir(root))
      .filter((fileName) => fileName.includes("run-rotate"));
    expect(files.length).toBeGreaterThan(1);
    await expect(store.loadRunSnapshots()).resolves.toEqual([
      expect.objectContaining({
        runId: "run-rotate",
        status: "completed",
      }),
    ]);
    await store.close();
  });

  it("keeps disk history within the configured run limit", async () => {
    const { root, store } = await createStore({ maxRunLogs: 2 });
    for (let index = 1; index <= 3; index += 1) {
      const runId = `run-${index}`;
      const timestamp = `2026-01-0${index}T00:00:00.000Z`;
      await store.record(started(runId, `thread-${index}`, timestamp));
      await store.record(completed(runId, timestamp));
    }

    const files = await readdir(root);
    expect(new Set(files.map((fileName) =>
      fileName.split(".part-")[0])).size).toBe(2);
    await expect(store.loadRunSnapshots()).resolves.toHaveLength(2);
    await store.close();
  });
});
