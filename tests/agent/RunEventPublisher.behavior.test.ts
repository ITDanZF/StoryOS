import { describe, expect, it, vi } from "vitest";
import AgentApplication from "../../src/main/story/application/conversations/AgentApplication.ts";
import RunEventPublisher from "../../src/main/story/application/conversations/events/RunEventPublisher.ts";
import type { AgentRunner } from "../../src/main/story/application/conversations/agentPorts.ts";

describe("durable run events", () => {
  it("releases the thread if model context setup fails synchronously", async () => {
    const runner: AgentRunner = { run: vi.fn(), cancelRun: vi.fn() };
    const app = new AgentApplication(runner, {
      withRunContext: () => {
        throw new Error("model setup failed");
      },
    });
    expect(() =>
      app.startRun({ threadId: "thread", message: { messageId: "message", content: "write" } }),
    ).toThrow("model setup failed");
    expect(app.hasActiveRuns()).toBe(false);
    expect(app.listRuns()[0].status).toBe("failed");
    await app.shutdown();
  });
  it.each(["run_started", "assistant.block.completed", "run_completed"])(
    "settles and releases the thread when %s cannot be persisted",
    async (failedType) => {
      const runner: AgentRunner = {
        run: vi.fn(async (_input, options) => {
          await options.onChunk("hello");
          return "hello";
        }),
        cancelRun: vi.fn(() => true),
      };
      const app = new AgentApplication(runner, {
        eventRecorder: {
          record: async (event) => {
            if (event.type === failedType) throw new Error("disk unavailable");
          },
        },
      });
      const id = app.startRun({
        threadId: "thread",
        message: { messageId: "message", content: "write" },
      });
      await expect(app.waitForRun(id)).rejects.toMatchObject({ code: "event.persistence_failed" });
      expect(app.hasActiveRuns()).toBe(false);
      expect(app.getRun(id)?.status).toBe("failed");
      if (failedType === "run_started") expect(runner.run).not.toHaveBeenCalled();
      await app.shutdown();
    },
  );

  it("isolates synchronous listeners after durable recording", async () => {
    const calls: string[] = [];
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const publisher = new RunEventPublisher({
      record: async () => {
        calls.push("record");
      },
    });
    publisher.subscribe(() => {
      throw new Error("window closed");
    });
    publisher.subscribe(() => {
      calls.push("notify");
    });
    try {
      await publisher.publish({
        type: "run_started",
        runId: "run",
        threadId: "thread",
        timestamp: new Date().toISOString(),
      });
      expect(calls).toEqual(["record", "notify"]);
    } finally {
      logger.mockRestore();
    }
  });
});
