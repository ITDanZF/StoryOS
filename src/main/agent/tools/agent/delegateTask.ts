import { tool } from "langchain";
import { z } from "zod";
import type { AgentEventHandler } from "../../Agent/AgentEvent.ts";
import type {
  AgentRunResult,
  RunAgentInput,
} from "../../Agent/AgentRuntime.ts";
import AgentRegistry from "../../Agent/AgentRegistry.ts";
import type RunBudget from "../../Agent/RunLimits.ts";
import type { ToolApprovalHandler } from "../../security/ToolPolicy.ts";

const delegateTaskSchema = z.object({
  subagent_type: z
    .string()
    .min(1)
    .describe("The id of the text-processing agent to run."),
  description: z
    .string()
    .min(1)
    .describe("A short description of the delegated task."),
  prompt: z
    .string()
    .min(1)
    .describe("The complete task prompt sent to the text-processing agent."),
});

export type DelegateAgentRuntime = {
  run(input: RunAgentInput): Promise<AgentRunResult>;
};

export type DelegateTaskContext = {
  readonly parentThreadId: string;
  readonly parentRunId: string;
  readonly parentDepth: number;
  readonly signal?: AbortSignal;
  readonly onEvent?: AgentEventHandler;
  readonly budget: RunBudget;
  readonly approval?: ToolApprovalHandler;
};

export function formatDelegateTaskResult(
  description: string,
  result: AgentRunResult,
): string {
  const header = [
    `Subagent ${result.status}.`,
    `task: ${description}`,
    `runId: ${result.runId}`,
    `agentType: ${result.agentType}`,
  ];

  switch (result.status) {
    case "completed":
      return [...header, "", "Result:", result.content].join("\n");

    case "aborted":
      return [
        ...header,
        "",
        "Partial result:",
        result.partialContent,
      ].join("\n");

    case "failed":
      return [
        ...header,
        `error: ${result.error}`,
        "",
        "Partial result:",
        result.partialContent,
      ].join("\n");
  }
}

export function createDelegateTaskTool(
  runtime: DelegateAgentRuntime,
  registry: AgentRegistry,
  context: DelegateTaskContext,
) {
  const availableAgents = registry
    .list()
    .map(({ id, description }) => `- ${id}: ${description}`)
    .join("\n");

  return tool(
    async ({ subagent_type, description, prompt }) => {
      if (
        context.parentDepth >= context.budget.limits.maxDelegationDepth
      ) {
        return [
          "Subagent delegation rejected.",
          `Maximum delegation depth is ${context.budget.limits.maxDelegationDepth}.`,
        ].join("\n");
      }

      try {
        registry.get(subagent_type);

        const result = await runtime.run({
          agentType: subagent_type,
          prompt,
          parentThreadId: context.parentThreadId,
          parentRunId: context.parentRunId,
          depth: context.parentDepth + 1,
          signal: context.signal,
          onEvent: context.onEvent,
          budget: context.budget,
          approval: context.approval,
        });

        return formatDelegateTaskResult(description, result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        return [
          "Subagent failed.",
          `task: ${description}`,
          `agentType: ${subagent_type}`,
          `error: ${errorMessage}`,
        ].join("\n");
      }
    },
    {
      name: "delegate_task",
      description: [
        "Delegate a focused text-processing task to a specialized subagent.",
        "",
        "Available subagents:",
        availableAgents || "- none",
      ].join("\n"),
      schema: delegateTaskSchema,
    },
  );
}
