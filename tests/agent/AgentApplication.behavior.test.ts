import { describe, expect, it, vi } from "vitest";
import AgentApplication from "../../src/main/agent/application/AgentApplication.ts";
import type {
  ApplicationEvent,
} from "../../src/main/agent/application/contracts.ts";
import type { AgentRunner } from "../../src/main/agent/application/ports.ts";
import { RunTimedOutError } from "../../src/main/agent/Agent/RunLimits.ts";

function waitForEvent(
  events: readonly ApplicationEvent[],
  predicate: (event: ApplicationEvent) => boolean,
): Promise<ApplicationEvent> {
  return vi.waitFor(() => {
    const event = events.find(predicate);
    expect(event).toBeDefined();
    return event as ApplicationEvent;
  });
}

describe("AgentApplication behavior", () => {
  it("publishes streamed chunks and records a completed run", async () => {
    const runner: AgentRunner = {
      run: async (_input, options) => {
        await options.onChunk("hello ");
        await options.onChunk("world");
        return "hello world";
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner);
    const events: ApplicationEvent[] = [];
    application.subscribe((event) => {
      events.push(event);
    });

    const runId = application.startRun({
      threadId: "thread-1",
      input: "say hello",
    });

    await expect(application.waitForRun(runId)).resolves.toBe("hello world");
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "text_delta",
      "run_completed",
    ]);
    expect(application.getRun(runId)).toMatchObject({
      runId,
      threadId: "thread-1",
      status: "completed",
      content: "hello world",
    });
  });

  it("pauses for tool approval and resumes with the selected decision", async () => {
    const runner: AgentRunner = {
      run: async (_input, options) => {
        const decision = await options.approval({
          toolName: "write_file",
          summary: "Write file: story.md",
          input: { path: "story.md", content: "Once upon a time" },
        });
        return `decision:${decision}`;
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner);
    const events: ApplicationEvent[] = [];
    application.subscribe((event) => {
      events.push(event);
    });

    const runId = application.startRun({
      threadId: "thread-approval",
      input: "write the story",
    });
    const requested = await waitForEvent(
      events,
      (event) => event.type === "approval_requested",
    );
    expect(requested).toMatchObject({
      type: "approval_requested",
      runId,
      toolName: "write_file",
      summary: "Write file: story.md",
    });
    if (requested.type !== "approval_requested") {
      throw new Error("Expected an approval request.");
    }

    await expect(
      application.resolveApproval(requested.approvalId, "allow_once"),
    ).resolves.toBe(true);
    await expect(application.waitForRun(runId)).resolves.toBe(
      "decision:allow_once",
    );
    expect(events.some((event) => event.type === "approval_resolved")).toBe(
      true,
    );
  });

  it("classifies a user cancellation as an aborted run", async () => {
    let rejectRun: (reason: unknown) => void = () => undefined;
    const runner: AgentRunner = {
      run: () =>
        new Promise<string>((_resolve, reject) => {
          rejectRun = reject;
        }),
      cancelRun: (_runId, reason) => {
        rejectRun(reason);
        return true;
      },
    };
    const application = new AgentApplication(runner);
    const events: ApplicationEvent[] = [];
    application.subscribe((event) => {
      events.push(event);
    });

    const runId = application.startRun({
      threadId: "thread-cancel",
      input: "keep working",
    });
    expect(application.cancelRun(runId)).toBe(true);

    await expect(application.waitForRun(runId)).rejects.toThrow(
      `Run cancelled by user: ${runId}`,
    );
    expect(application.getRun(runId)).toMatchObject({
      runId,
      status: "aborted",
    });
    expect(events.some((event) => event.type === "run_aborted")).toBe(true);
  });

  it("classifies runner timeouts separately from ordinary failures", async () => {
    const runner: AgentRunner = {
      run: async () => {
        throw new RunTimedOutError(250);
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner);
    const events: ApplicationEvent[] = [];
    application.subscribe((event) => {
      events.push(event);
    });

    const runId = application.startRun({
      threadId: "thread-timeout",
      input: "slow task",
    });

    await expect(application.waitForRun(runId)).rejects.toThrow(
      "Agent run timed out after 250ms.",
    );
    expect(application.getRun(runId)).toMatchObject({
      runId,
      status: "timed_out",
    });
    expect(events.some((event) => event.type === "run_timed_out")).toBe(true);
  });

  it("publishes subagent lineage fields for run log reconstruction", async () => {
    const runner: AgentRunner = {
      run: async (_input, options) => {
        await options.onAgentEvent({
          type: "run_started",
          runId: "subagent-run",
          agentType: "text-analyzer",
          threadId: "thread-lineage/agents/text-analyzer/subagent-run",
          parentRunId: options.runId,
          depth: 1,
        });
        return "done";
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner);
    const events: ApplicationEvent[] = [];
    application.subscribe((event) => {
      events.push(event);
    });

    const runId = application.startRun({
      threadId: "thread-lineage",
      input: "delegate",
    });

    await expect(application.waitForRun(runId)).resolves.toBe("done");
    expect(events).toContainEqual(expect.objectContaining({
      type: "agent_status",
      runId,
      agentRunId: "subagent-run",
      agentType: "text-analyzer",
      status: "started",
      threadId: "thread-lineage/agents/text-analyzer/subagent-run",
      parentRunId: runId,
      depth: 1,
    }));
  });

  it("publishes main-agent tool lifecycle events with a stable call id", async () => {
    const runner: AgentRunner = {
      run: async (_input, options) => {
        await options.onAgentEvent({
          type: "tool_started",
          runId: options.runId,
          agentType: "main",
          toolCallId: "tool-call-1",
          toolName: "create_book_chapter",
          summary: "Create chapter",
        });
        await options.onAgentEvent({
          type: "tool_completed",
          runId: options.runId,
          agentType: "main",
          toolCallId: "tool-call-1",
          toolName: "create_book_chapter",
          summary: "Create chapter",
        });
        return "done";
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner);
    const events: ApplicationEvent[] = [];
    application.subscribe((event) => {
      events.push(event);
    });

    const runId = application.startRun({
      threadId: "thread-main-tool",
      input: "create a chapter",
    });
    await expect(application.waitForRun(runId)).resolves.toBe("done");

    expect(events.filter((event) => event.type === "tool_status")).toEqual([
      expect.objectContaining({
        type: "tool_status",
        runId,
        toolCallId: "tool-call-1",
        toolName: "create_book_chapter",
        status: "started",
      }),
      expect.objectContaining({
        type: "tool_status",
        runId,
        toolCallId: "tool-call-1",
        toolName: "create_book_chapter",
        status: "completed",
      }),
    ]);
  });
});
