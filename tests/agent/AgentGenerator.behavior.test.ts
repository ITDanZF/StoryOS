import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/main/agent/runtime/AgentEvent.ts";
import AgentGenerator from "../../src/main/story/integration/StoryAgentGenerator.ts";
import AgentRegistry from "../../src/main/agent/runtime/AgentRegistry.ts";
import type { AgentModelRunner } from "../../src/main/agent/runtime/AgentRuntime.ts";
import type { RunLimits } from "../../src/main/agent/runtime/RunLimits.ts";
import type { ModelRunInput } from "../../src/main/agent/model/ModelGateway.ts";
import type Model from "../../src/main/agent/model/Model.ts";
import ToolResolver from "../../src/main/story/integration/StoryToolResolver.ts";
import { tool } from "langchain";
import { z } from "zod";

const limits: RunLimits = {
  maxTurns: 4,
  maxToolCalls: 10,
  timeoutMs: 0,
  maxDelegationDepth: 1,
};

function asModel(model: AgentModelRunner): Model {
  return model as unknown as Model;
}

function turnInput(content: string) {
  return { message: { messageId: `message-${content}`, content } };
}

describe("AgentGenerator behavior", () => {
  it("preserves root streaming and completion events through AgentExecutor", async () => {
    const generator = new AgentGenerator({
      model: asModel({
        stream: async function* () {
          yield "root ";
          yield "answer";
        },
      }),
      toolResolver: new ToolResolver([]),
      limits,
    });
    const events: AgentEvent[] = [];
    const chunks: string[] = [];

    await expect(
      generator.run(turnInput("answer"), {
        runId: "root-run",
        threadId: "thread-1",
        grantedToolIds: [],
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
        onAgentEvent: (event) => {
          events.push(event);
        },
      }),
    ).resolves.toBe("root answer");
    expect(chunks).toEqual(["root ", "answer"]);
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "text_delta",
      "run_completed",
    ]);
  });

  it("preserves root failure propagation with a single failure event", async () => {
    const generator = new AgentGenerator({
      model: asModel({
        stream: async function* () {
          yield "partial";
          throw new Error("root failed");
        },
      }),
      toolResolver: new ToolResolver([]),
      limits,
    });
    const events: AgentEvent[] = [];

    await expect(
      generator.run(turnInput("answer"), {
        runId: "root-failure",
        threadId: "thread-1",
        grantedToolIds: [],
        onAgentEvent: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow("root failed");
    expect(events.map((event) => event.type)).toEqual(["run_started", "text_delta", "run_failed"]);
  });

  it("retries a required write when the model only announces an action", async () => {
    const generateChapter = tool(
      async () => JSON.stringify({ success: true, action: "chapter_generated" }),
      {
        name: "generate_book_chapter_content",
        description: "Generate a chapter.",
        schema: z.object({}),
      },
    );
    let attempt = 0;
    const prompts: string[] = [];
    const model: AgentModelRunner = {
      stream: vi.fn(async function* (input: ModelRunInput) {
        attempt += 1;
        prompts.push(input.prompt);
        if (attempt === 1) {
          yield "我先查看当前书籍。";
          return;
        }
        const writeTool = input.tools.find((item) => item.name === "generate_book_chapter_content");
        if (!writeTool) throw new Error("generate_book_chapter_content missing");
        await writeTool.invoke({});
        yield "第一章已创建。";
      }),
    };
    const generator = new AgentGenerator({
      model: asModel(model),
      toolResolver: new ToolResolver([generateChapter]),
      limits,
    });
    const chunks: string[] = [];

    await expect(
      generator.run(turnInput("完成第一章"), {
        runId: "required-write-run",
        threadId: "thread-1",
        grantedToolIds: ["generate_book_chapter_content"],
        requiredEffects: ["book.write"],
        approval: async () => "allow_once",
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      }),
    ).resolves.toBe("第一章已创建。");

    expect(model.stream).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain("上一轮没有完成用户要求的实际写入");
    expect(chunks).toEqual(["第一章已创建。"]);
  });

  it("fails a required write after two responses without a write tool call", async () => {
    const createChapter = tool(async () => JSON.stringify({ success: true }), {
      name: "create_book_chapter",
      description: "Create a chapter.",
      schema: z.object({}),
    });
    const model: AgentModelRunner = {
      stream: vi.fn(async function* () {
        yield "我稍后处理。";
      }),
    };
    const generator = new AgentGenerator({
      model: asModel(model),
      toolResolver: new ToolResolver([createChapter]),
      limits,
    });
    const chunks: string[] = [];

    await expect(
      generator.run(turnInput("完成第一章"), {
        runId: "missing-write-run",
        threadId: "thread-1",
        grantedToolIds: ["create_book_chapter"],
        requiredEffects: ["book.write"],
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      }),
    ).rejects.toThrow("AI 未执行完成本次写入操作：book.write");

    expect(model.stream).toHaveBeenCalledTimes(2);
    expect(chunks).toEqual([]);
  });

  it("runs a delegated subagent task through the main agent tool list", async () => {
    const model: AgentModelRunner = {
      stream: vi.fn(async function* (input: ModelRunInput) {
        const delegateTask = input.tools.find((item) => item.name === "delegate_task");
        if (!delegateTask) throw new Error("delegate_task missing");
        yield await delegateTask.invoke({
          subagent_type: "text-analyzer",
          description: "Analyze a paragraph",
          prompt: "Extract the central idea.",
        });
      }),
      invokeText: vi.fn(async (input) => {
        expect(input.threadId).toContain("thread-1/agents/text-analyzer/run_");
        expect(input.prompt).toBe("Extract the central idea.");
        return "specialist result";
      }),
    };
    const generator = new AgentGenerator({
      model: asModel(model),
      registry: new AgentRegistry([
        {
          id: "text-analyzer",
          name: "Text Analyzer",
          description: "Analyze text.",
          systemPrompt: "Analyze text.",
          capabilities: ["text.inspect"],
          allowedToolIds: [],
          allowedEffects: [],
          acceptedContexts: ["global"],
          executionModes: ["planned"],
          outputKinds: ["text"],
          limits: { maxTurns: 3 },
        },
      ]),
      toolResolver: new ToolResolver([]),
      limits,
    });
    const events: AgentEvent[] = [];

    await expect(
      generator.run(turnInput("delegate this"), {
        runId: "root-run",
        threadId: "thread-1",
        grantedToolIds: [],
        onAgentEvent: (event) => {
          events.push(event);
        },
      }),
    ).resolves.toContain("specialist result");
    expect(model.stream).toHaveBeenCalledOnce();
    expect(model.invokeText).toHaveBeenCalledOnce();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_started", agentType: "main" }),
        expect.objectContaining({ type: "run_started", agentType: "text-analyzer" }),
        expect.objectContaining({ type: "run_completed", agentType: "text-analyzer" }),
        expect.objectContaining({ type: "run_completed", agentType: "main" }),
      ]),
    );
  });
});
