import type { ModelRunInput } from "../model/Model.ts";
import type { RegisteredTool } from "../tools/ToolResolver.ts";
import {
  createAgentEvent,
  emitAgentEvent,
  type AgentEventHandler,
} from "./AgentEvent.ts";
import type { ExecutionContext } from "./ExecutionContext.ts";

export type AgentModelRunner = {
  stream(input: ModelRunInput): AsyncIterable<string>;
  invokeText?(input: ModelRunInput): Promise<string>;
};

export type AgentExecutionResult =
  | {
      readonly status: "completed";
      readonly content: string;
    }
  | {
      readonly status: "aborted";
      readonly partialContent: string;
      readonly cause?: unknown;
    }
  | {
      readonly status: "timed_out";
      readonly partialContent: string;
      readonly timeoutMs: number;
      readonly cause?: unknown;
    }
  | {
      readonly status: "failed";
      readonly partialContent: string;
      readonly error: string;
      readonly cause: unknown;
    };

export type AgentExecutorInput = {
  readonly context: ExecutionContext;
  readonly prompt: string;
  readonly systemPrompt: string | (() => string | Promise<string>);
  readonly tools: readonly RegisteredTool[];
  readonly maxTurns: number;
  readonly visibility?: ModelRunInput["visibility"];
  readonly mode: "stream" | "text";
  readonly checkAbortAfterModel?: boolean;
  readonly timeout?: {
    readonly timedOut: () => boolean;
    readonly timeoutMs: number;
  };
  readonly onChunk?: (chunk: string) => void | Promise<void>;
  readonly onEvent?: AgentEventHandler;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class AgentExecutor {
  constructor(private readonly model: AgentModelRunner) {}

  async execute(input: AgentExecutorInput): Promise<AgentExecutionResult> {
    const { context } = input;
    const chunks: string[] = [];

    await emitAgentEvent(
      input.onEvent,
      createAgentEvent(context, {
        type: "run_started",
        threadId: context.threadId,
        parentRunId: context.parentRunId,
        depth: context.depth,
      }),
    );

    if (context.signal?.aborted) {
      return this.abort(input, chunks, context.signal.reason);
    }

    try {
      const systemPrompt = typeof input.systemPrompt === "function"
        ? await input.systemPrompt()
        : input.systemPrompt;
      const modelInput: ModelRunInput = {
        prompt: input.prompt,
        threadId: context.threadId,
        systemPrompt,
        tools: [...input.tools],
        signal: context.signal,
        maxTurns: input.maxTurns,
        ...(input.visibility ? { visibility: input.visibility } : {}),
      };

      if (input.mode === "text" && this.model.invokeText) {
        await this.appendChunk(
          await this.model.invokeText(modelInput),
          input,
          chunks,
        );
      } else {
        for await (const chunk of this.model.stream(modelInput)) {
          await this.appendChunk(chunk, input, chunks);
        }
      }

      if (input.checkAbortAfterModel && context.signal?.aborted) {
        throw context.signal.reason ?? new Error("Agent run aborted.");
      }

      const content = chunks.join("");
      await emitAgentEvent(
        input.onEvent,
        createAgentEvent(context, {
          type: "run_completed",
          content,
        }),
      );
      return Object.freeze({ status: "completed", content });
    } catch (error) {
      if (input.timeout?.timedOut()) {
        const partialContent = chunks.join("");
        await emitAgentEvent(
          input.onEvent,
          createAgentEvent(context, {
            type: "run_timed_out",
            partialContent,
            timeoutMs: input.timeout.timeoutMs,
          }),
        );
        return Object.freeze({
          status: "timed_out",
          partialContent,
          timeoutMs: input.timeout.timeoutMs,
          cause: error,
        });
      }

      if (context.signal?.aborted) {
        return this.abort(input, chunks, context.signal.reason ?? error);
      }

      const partialContent = chunks.join("");
      const message = errorMessage(error);
      await emitAgentEvent(
        input.onEvent,
        createAgentEvent(context, {
          type: "run_failed",
          partialContent,
          error: message,
        }),
      );
      return Object.freeze({
        status: "failed",
        partialContent,
        error: message,
        cause: error,
      });
    }
  }

  private async appendChunk(
    chunk: string,
    input: AgentExecutorInput,
    chunks: string[],
  ): Promise<void> {
    chunks.push(chunk);
    await emitAgentEvent(
      input.onEvent,
      createAgentEvent(input.context, {
        type: "text_delta",
        content: chunk,
      }),
    );
    await input.onChunk?.(chunk);
  }

  private async abort(
    input: AgentExecutorInput,
    chunks: readonly string[],
    cause?: unknown,
  ): Promise<AgentExecutionResult> {
    const partialContent = chunks.join("");
    await emitAgentEvent(
      input.onEvent,
      createAgentEvent(input.context, {
        type: "run_aborted",
        partialContent,
      }),
    );
    return Object.freeze({
      status: "aborted",
      partialContent,
      ...(cause !== undefined ? { cause } : {}),
    });
  }
}
