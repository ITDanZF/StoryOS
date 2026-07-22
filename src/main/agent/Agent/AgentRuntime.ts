import type { ModelRunInput } from "../model/Model.ts";
import ToolResolver from "../tools/ToolResolver.ts";
import {
  createAgentEvent,
  emitAgentEvent,
  emitToolExecutionEvent,
  type AgentEventHandler,
} from "./AgentEvent.ts";
import AgentRegistry from "./AgentRegistry.ts";
import { createExecutionContext } from "./ExecutionContext.ts";
import RunBudget, { DEFAULT_RUN_LIMITS } from "./RunLimits.ts";
import { guardTools } from "../security/GuardedTool.ts";
import ToolPolicy, {
  denyToolApproval,
  type ToolApprovalHandler,
} from "../security/ToolPolicy.ts";

export type RunAgentInput = {
  readonly agentType: string;
  readonly prompt: string;
  readonly parentThreadId: string;
  readonly parentRunId?: string;
  readonly depth?: number;
  readonly signal?: AbortSignal;
  readonly onEvent?: AgentEventHandler;
  readonly budget?: RunBudget;
  readonly approval?: ToolApprovalHandler;
};

export type AgentRunResult =
  | {
      readonly status: "completed";
      readonly runId: string;
      readonly agentType: string;
      readonly threadId: string;
      readonly content: string;
    }
  | {
      readonly status: "aborted";
      readonly runId: string;
      readonly agentType: string;
      readonly threadId: string;
      readonly partialContent: string;
    }
  | {
      readonly status: "failed";
      readonly runId: string;
      readonly agentType: string;
      readonly threadId: string;
      readonly partialContent: string;
      readonly error: string;
    };

export type AgentModelRunner = {
  stream(input: ModelRunInput): AsyncIterable<string>;
  invokeText?(input: ModelRunInput): Promise<string>;
};

export default class AgentRuntime {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly model: AgentModelRunner,
    private readonly toolResolver: ToolResolver,
    private readonly toolPolicy: ToolPolicy = new ToolPolicy(),
    private readonly approval: ToolApprovalHandler = denyToolApproval,
  ) {}

  async run(input: RunAgentInput): Promise<AgentRunResult> {
    if (!input.prompt.trim()) {
      throw new Error("Agent prompt is required.");
    }

    const definition = this.registry.get(input.agentType);
    const context = createExecutionContext({
      agentType: definition.id,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      depth: input.depth,
      signal: input.signal,
    });
    const budget = input.budget ?? new RunBudget({
      ...DEFAULT_RUN_LIMITS,
      maxTurns: definition.maxTurns ?? DEFAULT_RUN_LIMITS.maxTurns,
    });
    const tools = guardTools(this.toolResolver.resolve(definition.tools), {
      policy: this.toolPolicy,
      approval: input.approval ?? this.approval,
      budget,
      onEvent: (event) =>
        emitToolExecutionEvent(input.onEvent, context, event),
    });
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
      return this.abort(context, chunks, input.onEvent);
    }

    try {
      const modelInput: ModelRunInput = {
        prompt: input.prompt,
        threadId: context.threadId,
        systemPrompt: definition.systemPrompt,
        tools,
        signal: context.signal,
        maxTurns: definition.maxTurns ?? budget.limits.maxTurns,
        visibility: "internal",
      };
      const appendChunk = async (chunk: string) => {
        chunks.push(chunk);
        await emitAgentEvent(
          input.onEvent,
          createAgentEvent(context, {
            type: "text_delta",
            content: chunk,
          }),
        );
      };

      if (this.model.invokeText) {
        await appendChunk(await this.model.invokeText(modelInput));
      } else {
        for await (const chunk of this.model.stream(modelInput)) {
          await appendChunk(chunk);
        }
      }

      const content = chunks.join("");

      await emitAgentEvent(
        input.onEvent,
        createAgentEvent(context, {
          type: "run_completed",
          content,
        }),
      );

      return Object.freeze({
        status: "completed",
        runId: context.runId,
        agentType: context.agentType,
        threadId: context.threadId,
        content,
      });
    } catch (error) {
      if (context.signal?.aborted) {
        return this.abort(context, chunks, input.onEvent);
      }

      const partialContent = chunks.join("");
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await emitAgentEvent(
        input.onEvent,
        createAgentEvent(context, {
          type: "run_failed",
          partialContent,
          error: errorMessage,
        }),
      );

      return Object.freeze({
        status: "failed",
        runId: context.runId,
        agentType: context.agentType,
        threadId: context.threadId,
        partialContent,
        error: errorMessage,
      });
    }
  }

  private async abort(
    context: ReturnType<typeof createExecutionContext>,
    chunks: readonly string[],
    onEvent: AgentEventHandler | undefined,
  ): Promise<AgentRunResult> {
    const partialContent = chunks.join("");

    await emitAgentEvent(
      onEvent,
      createAgentEvent(context, {
        type: "run_aborted",
        partialContent,
      }),
    );

    return Object.freeze({
      status: "aborted",
      runId: context.runId,
      agentType: context.agentType,
      threadId: context.threadId,
      partialContent,
    });
  }
}
