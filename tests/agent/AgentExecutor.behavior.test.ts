import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/main/agent/Agent/AgentEvent.ts";
import AgentExecutor, {
  type AgentExecutorInput,
  type AgentModelRunner,
} from "../../src/main/agent/Agent/AgentExecutor.ts";
import { createRootExecutionContext } from "../../src/main/agent/Agent/ExecutionContext.ts";

function createInput(
  events: AgentEvent[],
  overrides: Partial<AgentExecutorInput> = {},
): AgentExecutorInput {
  return {
    context: createRootExecutionContext({
      runId: "run-executor",
      threadId: "thread-executor",
    }),
    prompt: "hello",
    systemPrompt: "system",
    tools: [],
    maxTurns: 4,
    mode: "stream",
    onEvent: (event: AgentEvent) => {
      events.push(event);
    },
    ...overrides,
  };
}

describe("AgentExecutor behavior", () => {
  it("owns the shared start, delta, and completion lifecycle", async () => {
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "hello ";
        yield "world";
      },
    };
    const executor = new AgentExecutor(model);
    const events: AgentEvent[] = [];
    const chunks: string[] = [];

    await expect(
      executor.execute(createInput(events, {
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      })),
    ).resolves.toEqual({
      status: "completed",
      content: "hello world",
    });
    expect(chunks).toEqual(["hello ", "world"]);
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "text_delta",
      "run_completed",
    ]);
  });

  it("uses text invocation for subagent-style execution when available", async () => {
    const stream = vi.fn(async function* () {
      yield "unexpected";
    });
    const invokeText = vi.fn(async () => "single result");
    const executor = new AgentExecutor({ stream, invokeText });
    const events: AgentEvent[] = [];

    await expect(
      executor.execute(createInput(events, { mode: "text" })),
    ).resolves.toEqual({
      status: "completed",
      content: "single result",
    });
    expect(invokeText).toHaveBeenCalledOnce();
    expect(stream).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_completed",
    ]);
  });

  it("returns partial content and emits one failure event when the model fails", async () => {
    const failure = new Error("model failed");
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "partial";
        throw failure;
      },
    };
    const executor = new AgentExecutor(model);
    const events: AgentEvent[] = [];

    await expect(
      executor.execute(createInput(events)),
    ).resolves.toEqual({
      status: "failed",
      partialContent: "partial",
      error: "model failed",
      cause: failure,
    });
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_failed",
    ]);
  });

  it("classifies an aborted model failure as a timeout when requested", async () => {
    const controller = new AbortController();
    const failure = new Error("aborted by timeout");
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "partial";
        controller.abort(failure);
        throw failure;
      },
    };
    const executor = new AgentExecutor(model);
    const events: AgentEvent[] = [];

    await expect(
      executor.execute(createInput(events, {
        context: createRootExecutionContext({
          runId: "run-timeout",
          threadId: "thread-timeout",
          signal: controller.signal,
        }),
        timeout: {
          timedOut: () => true,
          timeoutMs: 500,
        },
      })),
    ).resolves.toEqual({
      status: "timed_out",
      partialContent: "partial",
      timeoutMs: 500,
      cause: failure,
    });
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_timed_out",
    ]);
  });

  it("does not emit text deltas produced after cancellation", async () => {
    const controller = new AbortController();
    const model: AgentModelRunner = {
      stream: async function* () {
        yield "before";
        controller.abort(new Error("stop streaming"));
        yield "after";
      },
    };
    const executor = new AgentExecutor(model);
    const events: AgentEvent[] = [];

    await expect(
      executor.execute(createInput(events, {
        context: createRootExecutionContext({
          runId: "run-cancel-delta",
          threadId: "thread-cancel-delta",
          signal: controller.signal,
        }),
      })),
    ).resolves.toEqual({
      status: "aborted",
      partialContent: "before",
      cause: expect.any(Error),
    });
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_aborted",
    ]);
    expect(events).not.toContainEqual(expect.objectContaining({
      type: "text_delta",
      content: "after",
    }));
  });
});
