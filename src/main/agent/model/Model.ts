import { ChatOpenAI } from '@langchain/openai';
import { AIMessageChunk, createAgent, HumanMessage } from 'langchain';
import { CONFIG_KEYS } from '../enum/Config.constant.ts';
import Memory from '../Memory/index.ts';
import type { RegisteredTool } from '../tools/ToolResolver.ts';

export type ModelRunInput = {
  readonly prompt: string;
  readonly threadId: string;
  readonly systemPrompt: string;
  readonly tools: RegisteredTool[];
  readonly signal?: AbortSignal;
  readonly maxTurns?: number;
  readonly visibility?: "public" | "internal";
};

const INTERNAL_RUN_TAG = "mini-agent:internal";

function getRecursionLimit(maxTurns: number | undefined): number | undefined {
  return maxTurns === undefined ? undefined : maxTurns * 2 + 1;
}

function hasInternalRunTag(metadata: unknown): boolean {
  if (typeof metadata !== "object" || metadata === null || !("tags" in metadata)) {
    return false;
  }
  const tags = (metadata as { readonly tags?: unknown }).tags;
  return Array.isArray(tags) && tags.includes(INTERNAL_RUN_TAG);
}

export default class Model {
  private readonly CurrentModel: ChatOpenAI;
  private readonly CurrentMemory: Memory;

  constructor() {
    this.CurrentMemory = new Memory({ checkpointBackend: 'sqlite' });
    this.CurrentModel = new ChatOpenAI({
      model: process.env[CONFIG_KEYS.MODEL_NAME],
      apiKey: process.env[CONFIG_KEYS.MODEL_API_KEY],
      configuration: { baseURL: process.env[CONFIG_KEYS.MODEL_BASE_URL] },
    });
  }

  private createRuntimeAgent(input: ModelRunInput) {
    return createAgent({
      model: this.CurrentModel,
      tools: input.tools,
      systemPrompt: input.systemPrompt,
      checkpointer: this.CurrentMemory.getCheckpointer(),
    });
  }

  invoke(input: ModelRunInput) {
    const runtimeAgent = this.createRuntimeAgent(input);
    return runtimeAgent.invoke(
      { messages: [new HumanMessage(input.prompt)] },
      {
        ...this.CurrentMemory.getConfig(input.threadId),
        recursionLimit: getRecursionLimit(input.maxTurns),
        signal: input.signal,
        ...(input.visibility === "internal" ? { tags: [INTERNAL_RUN_TAG] } : {}),
      },
    );
  }

  async invokeText(input: ModelRunInput): Promise<string> {
    const result = await this.invoke(input);
    const lastMessage = result.messages.at(-1);
    if (!lastMessage) throw new Error("Agent returned no messages.");
    if (typeof lastMessage.content === "string") return lastMessage.content;

    return lastMessage.content.map((part) => {
      if (typeof part === "string") return part;
      if ("text" in part && typeof part.text === "string") return part.text;
      return "";
    }).join("");
  }

  async *stream(input: ModelRunInput): AsyncGenerator<string, void, unknown> {
    const runtimeAgent = this.createRuntimeAgent(input);
    const stream = await runtimeAgent.stream(
      { messages: [new HumanMessage(input.prompt)] },
      {
        ...this.CurrentMemory.getConfig(input.threadId),
        recursionLimit: getRecursionLimit(input.maxTurns),
        streamMode: 'messages' as const,
        signal: input.signal,
      },
    );

    for await (const value of stream as AsyncIterable<unknown>) {
      if (!Array.isArray(value) || value.length < 2) continue;
      const [message, metadata] = value;
      if (hasInternalRunTag(metadata)) continue;
      if (!(message instanceof AIMessageChunk)) continue;
      if (typeof message.content !== 'string' || message.content.length === 0) continue;
      yield message.content;
    }
  }
}
