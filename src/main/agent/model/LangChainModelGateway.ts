import { ChatOpenAI } from "@langchain/openai";
import { AIMessageChunk, createAgent, HumanMessage } from "langchain";
import type { ModelConnectionConfiguration } from "./ModelConfiguration.ts";
import type { ModelGateway, ModelRunInput, ModelStreamPart } from "./ModelGateway.ts";
import type { ModelSessionStore } from "./ModelSessionStore.ts";

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

export type LangChainModelGatewayOptions = {
  readonly configuration: ModelConnectionConfiguration;
  readonly sessions: ModelSessionStore;
};

export default class LangChainModelGateway implements ModelGateway {
  private readonly chatModel: ChatOpenAI;

  constructor(private readonly options: LangChainModelGatewayOptions) {
    this.chatModel = new ChatOpenAI({
      model: options.configuration.modelName,
      apiKey: options.configuration.apiKey,
      configuration: { baseURL: options.configuration.baseUrl },
    });
  }

  private createRuntimeAgent(input: ModelRunInput) {
    return createAgent({
      model: this.chatModel,
      tools: input.tools,
      systemPrompt: input.systemPrompt,
      checkpointer: this.options.sessions.getCheckpointer(),
    });
  }

  invoke(input: ModelRunInput) {
    const runtimeAgent = this.createRuntimeAgent(input);
    return runtimeAgent.invoke(
      { messages: [new HumanMessage(input.prompt)] },
      {
        ...this.options.sessions.getConfig(input.threadId),
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

  async *stream(input: ModelRunInput): AsyncGenerator<ModelStreamPart, void, unknown> {
    const runtimeAgent = this.createRuntimeAgent(input);
    const internal = input.visibility === "internal";
    const stream = await runtimeAgent.stream(
      { messages: [new HumanMessage(input.prompt)] },
      {
        ...this.options.sessions.getConfig(input.threadId),
        recursionLimit: getRecursionLimit(input.maxTurns),
        streamMode: "messages" as const,
        signal: input.signal,
        ...(internal ? { tags: [INTERNAL_RUN_TAG] } : {}),
      },
    );

    for await (const value of stream as AsyncIterable<unknown>) {
      if (!Array.isArray(value) || value.length < 2) continue;
      const [message, metadata] = value;
      // Public parent runs can observe nested model callbacks emitted by tools.
      // Keep those tokens in the artifact pipeline that initiated the internal
      // run, but never forward them as public assistant text.
      if (!internal && hasInternalRunTag(metadata)) continue;
      if (!(message instanceof AIMessageChunk)) continue;
      const reasoning = message.additional_kwargs?.reasoning_content;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        yield { channel: "reasoning", delta: reasoning };
      }
      if (typeof message.content === "string") {
        if (message.content.length > 0) {
          yield { channel: "answer", delta: message.content };
        }
        continue;
      }
      for (const part of message.content) {
        if (typeof part !== "object" || part === null) continue;
        const values = part as Record<string, unknown>;
        const text = typeof values.text === "string"
          ? values.text
          : typeof values.reasoning === "string"
            ? values.reasoning
            : "";
        if (!text) continue;
        const type = typeof values.type === "string" ? values.type : "";
        yield {
          channel: /reason/i.test(type) || "reasoning" in values
            ? "reasoning"
            : "answer",
          delta: text,
        };
      }
    }
  }
}
