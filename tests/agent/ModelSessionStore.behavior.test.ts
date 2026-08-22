import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RUN_LIMITS } from "../../src/main/agent/Agent/RunLimits.ts";
import Memory from "../../src/main/agent/Memory/index.ts";
import type { ModelSessionStore } from "../../src/main/agent/model/ModelSessionStore.ts";
import { baseSystemPrompt } from "../../src/main/agent/model/prompts/system.ts";

const langChainMocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class ChatOpenAI {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock("langchain", () => ({
  AIMessageChunk: class AIMessageChunk {},
  HumanMessage: class HumanMessage {
    constructor(readonly content: string) {}
  },
  createAgent: langChainMocks.createAgent,
}));

import LangChainModelGateway from "../../src/main/agent/model/LangChainModelGateway.ts";

describe("Model session store behavior", () => {
  beforeEach(() => {
    langChainMocks.createAgent.mockReset();
    langChainMocks.invoke.mockReset();
    langChainMocks.createAgent.mockReturnValue({
      invoke: langChainMocks.invoke,
    });
    langChainMocks.invoke.mockResolvedValue({
      messages: [{ content: "model result" }],
    });
  });

  it("preserves Memory thread configuration semantics", () => {
    const sessions: ModelSessionStore = new Memory();

    expect(sessions.getConfig("thread-a")).toEqual({
      configurable: { thread_id: "thread-a" },
    });
    expect(sessions.getCheckpointer()).toBe(sessions.getCheckpointer());
    sessions.close();
  });

  it("budgets complex tool runs while instructing the model to terminate", () => {
    expect(DEFAULT_RUN_LIMITS.maxTurns * 2 + 1).toBe(25);
    expect(baseSystemPrompt).toContain("相同参数重复调用同一读取工具");
    expect(baseSystemPrompt).toContain("立即停止调用工具并给出最终答复");
    expect(baseSystemPrompt).toContain("不得反复搜索、读取或重试");
  });

  it("uses an injected session store without taking ownership of its lifecycle", async () => {
    const checkpointer = {};
    const sessions: ModelSessionStore = {
      getCheckpointer: vi.fn(
        () => checkpointer,
      ) as unknown as ModelSessionStore["getCheckpointer"],
      getConfig: vi.fn((threadId: string) => ({
        configurable: { thread_id: threadId },
      })),
      close: vi.fn(),
    };
    const gateway = new LangChainModelGateway({
      configuration: {
        modelName: "test-model",
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
      },
      sessions,
    });

    await expect(gateway.invokeText({
      prompt: "hello",
      threadId: "thread-injected",
      systemPrompt: "system",
      tools: [],
      maxTurns: 2,
      visibility: "internal",
    })).resolves.toBe("model result");

    expect(sessions.getCheckpointer).toHaveBeenCalledOnce();
    expect(sessions.getConfig).toHaveBeenCalledWith("thread-injected");
    expect(langChainMocks.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      checkpointer,
      systemPrompt: "system",
      tools: [],
    }));
    expect(langChainMocks.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [expect.objectContaining({ content: "hello" })] }),
      expect.objectContaining({
        configurable: { thread_id: "thread-injected" },
        recursionLimit: 5,
        tags: ["mini-agent:internal"],
      }),
    );
    expect(sessions.close).not.toHaveBeenCalled();
    expect("close" in gateway).toBe(false);
  });
});
