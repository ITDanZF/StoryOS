import { describe, expect, it, vi } from "vitest";
import AgentApplication from "../../src/main/agent/application/AgentApplication.ts";
import type {
  ApplicationEvent,
} from "../../src/main/agent/application/contracts.ts";
import type { AgentRunner } from "../../src/main/agent/application/ports.ts";
import { RunTimedOutError } from "../../src/main/agent/Agent/RunLimits.ts";

function runRequest(threadId: string, content: string) {
  return {
    threadId,
    message: { messageId: `message-${threadId}`, content },
  };
}

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

    const runId = application.startRun(runRequest("thread-1", "say hello"));

    await expect(application.waitForRun(runId)).resolves.toBe("hello world");
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "user.message.created",
      "turn.started",
      "assistant.block.started",
      "assistant.block.delta",
      "assistant.block.delta",
      "assistant.block.completed",
      "turn.completed",
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
          toolCallId: "tool-call-approval",
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

    const runId = application.startRun(
      runRequest("thread-approval", "write the story"),
    );
    const requested = await waitForEvent(
      events,
      (event) => event.type === "approval.requested",
    );
    expect(requested).toMatchObject({
      type: "approval.requested",
      runId,
      payload: {
        approvalId: expect.any(String),
        toolCallId: "tool-call-approval",
        toolName: "write_file",
        summary: "Write file: story.md",
        preview: expect.any(String),
      },
    });
    if (requested.type !== "approval.requested") {
      throw new Error("Expected an approval request.");
    }

    await expect(
      application.resolveApproval(requested.payload.approvalId, "allow_once"),
    ).resolves.toBe(true);
    await expect(application.waitForRun(runId)).resolves.toBe(
      "decision:allow_once",
    );
    expect(events.some((event) => event.type === "approval.resolved")).toBe(
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

    const runId = application.startRun(
      runRequest("thread-cancel", "keep working"),
    );
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

    const runId = application.startRun(
      runRequest("thread-timeout", "slow task"),
    );

    await expect(application.waitForRun(runId)).rejects.toThrow(
      "Agent run timed out after 250ms.",
    );
    expect(application.getRun(runId)).toMatchObject({
      runId,
      status: "timed_out",
    });
    expect(events.some((event) => event.type === "run_timed_out")).toBe(true);
  });

  it("keeps private subagent lifecycle events out of the conversation stream", async () => {
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

    const runId = application.startRun(
      runRequest("thread-lineage", "delegate"),
    );

    await expect(application.waitForRun(runId)).resolves.toBe("done");
    expect(events.some((event) => "agentRunId" in event)).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "user.message.created",
      "turn.started",
      "turn.completed",
      "run_completed",
    ]);
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

    const runId = application.startRun(
      runRequest("thread-main-tool", "create a chapter"),
    );
    await expect(application.waitForRun(runId)).resolves.toBe("done");

    expect(events.filter((event) => event.type.startsWith("tool.call."))).toEqual([
      expect.objectContaining({
        type: "tool.call.started",
        runId,
        payload: expect.objectContaining({
          toolCallId: "tool-call-1",
          toolName: "create_book_chapter",
        }),
      }),
      expect.objectContaining({
        type: "tool.call.completed",
        runId,
        payload: { toolCallId: "tool-call-1" },
      }),
    ]);
  });
});
