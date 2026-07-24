import { describe, expect, it, vi } from "vitest";
import AgentApplication from "../../src/main/agent/application/AgentApplication.ts";
import type { RunSnapshot } from "../../src/main/agent/application/contracts.ts";
import type { AgentRunner } from "../../src/main/agent/application/ports.ts";
import type { ApplicationEventRecorder } from "../../src/main/agent/runtime/RunLogStore.ts";

function completedHistory(index: number): RunSnapshot {
  return {
    runId: `history-${index}`,
    threadId: `thread-${index}`,
    status: "completed",
    startedAt: `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    completedAt: `2026-01-${String(index).padStart(2, "0")}T00:00:01.000Z`,
    durationMs: 1_000,
  };
}

describe("AgentApplication lifecycle behavior", () => {
  it("restores history and retains only the newest configured runs", () => {
    const runner: AgentRunner = {
      run: async () => "unused",
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner, {
      initialRuns: [
        completedHistory(3),
        completedHistory(2),
        completedHistory(1),
      ],
      maxRetainedRuns: 2,
    });

    expect(application.listRuns().map((run) => run.runId)).toEqual([
      "history-3",
      "history-2",
    ]);
    expect(application.waitForRun("history-3")).resolves.toBe("");
    expect(application.getRun("history-1")).toBeNull();
  });

  it("evicts old settled runs without evicting an active run", async () => {
    let finishActive: (content: string) => void = () => undefined;
    const activePromise = new Promise<string>((resolve) => {
      finishActive = resolve;
    });
    const runner: AgentRunner = {
      run: (input) => input === "active" ? activePromise : Promise.resolve(input),
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner, { maxRetainedRuns: 1 });
    const activeRunId = application.startRun({
      threadId: "active-thread",
      input: "active",
    });
    const completedRunId = application.startRun({
      threadId: "completed-thread",
      input: "completed",
    });
    await application.waitForRun(completedRunId);

    expect(application.getRun(activeRunId)?.status).toBe("running");
    expect(application.getRun(completedRunId)?.status).toBe("completed");
    finishActive("done");
    await application.waitForRun(activeRunId);
    expect(application.listRuns()).toHaveLength(1);
    expect(application.getRun(completedRunId)?.status).toBe("completed");
  });

  it("cancels active work, closes logs, and rejects new work during shutdown", async () => {
    let rejectActive: (reason: unknown) => void = () => undefined;
    const runner: AgentRunner = {
      run: () => new Promise<string>((_resolve, reject) => {
        rejectActive = reject;
      }),
      cancelRun: vi.fn((_runId, reason) => {
        rejectActive(reason);
        return true;
      }),
    };
    const recorder: ApplicationEventRecorder = {
      record: vi.fn(async () => undefined),
      flush: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const application = new AgentApplication(runner, {
      eventRecorder: recorder,
    });
    application.startRun({ threadId: "thread-active", input: "work" });

    await application.shutdown();

    expect(runner.cancelRun).toHaveBeenCalled();
    expect(recorder.flush).toHaveBeenCalledOnce();
    expect(recorder.close).toHaveBeenCalledOnce();
    expect(application.hasActiveRuns()).toBe(false);
    expect(application.listRuns()).toEqual([]);
    expect(() =>
      application.startRun({ threadId: "thread-new", input: "new work" }),
    ).toThrow("shutting down");
    await application.shutdown();
    expect(recorder.close).toHaveBeenCalledOnce();
  });
});


