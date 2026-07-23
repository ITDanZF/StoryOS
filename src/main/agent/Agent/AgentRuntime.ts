import ToolResolver from "../tools/ToolResolver.ts";
import { emitToolExecutionEvent, type AgentEventHandler } from "./AgentEvent.ts";
import AgentExecutor, {
  type AgentModelRunner,
} from "./AgentExecutor.ts";
import AgentRegistry from "./AgentRegistry.ts";
import { createExecutionContext } from "./ExecutionContext.ts";
import RunBudget, { DEFAULT_RUN_LIMITS } from "./RunLimits.ts";
import { guardTools } from "../security/GuardedTool.ts";
import ToolPolicy, {
  denyToolApproval,
  type ToolApprovalHandler,
} from "../security/ToolPolicy.ts";

export type { AgentModelRunner } from "./AgentExecutor.ts";

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

export default class AgentRuntime {
  private readonly executor: AgentExecutor;

  constructor(
    private readonly registry: AgentRegistry,
    model: AgentModelRunner,
    private readonly toolResolver: ToolResolver,
    private readonly toolPolicy: ToolPolicy = new ToolPolicy(),
    private readonly approval: ToolApprovalHandler = denyToolApproval,
    executor?: AgentExecutor,
  ) {
    this.executor = executor ?? new AgentExecutor(model);
  }

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
    const result = await this.executor.execute({
      context,
      prompt: input.prompt,
      systemPrompt: definition.systemPrompt,
      tools,
      maxTurns: definition.maxTurns ?? budget.limits.maxTurns,
      modelReference: definition.model,
      visibility: "internal",
      mode: "text",
      onEvent: input.onEvent,
    });
    const source = {
      runId: context.runId,
      agentType: context.agentType,
      threadId: context.threadId,
    };

    switch (result.status) {
      case "completed":
        return Object.freeze({
          status: "completed",
          ...source,
          content: result.content,
        });
      case "aborted":
        return Object.freeze({
          status: "aborted",
          ...source,
          partialContent: result.partialContent,
        });
      case "failed":
        return Object.freeze({
          status: "failed",
          ...source,
          partialContent: result.partialContent,
          error: result.error,
        });
      case "timed_out":
        return Object.freeze({
          status: "aborted",
          ...source,
          partialContent: result.partialContent,
        });
    }
  }
}
