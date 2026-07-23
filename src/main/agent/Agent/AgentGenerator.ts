import AgentModel from "../model/index.ts";
import Model from "../model/Model.ts";
import { baseSystemPrompt } from "../model/prompts/system.ts";
import ToolResolver from "../tools/ToolResolver.ts";
import { createDelegateTaskTool } from "../tools/agent/delegateTask.ts";
import { guardTools } from "../security/GuardedTool.ts";
import ToolPolicy, {
  denyToolApproval,
  type ToolApprovalHandler,
} from "../security/ToolPolicy.ts";
import type { SkillContextProvider } from "../skills/SkillContextProvider.ts";
import AgentExecutor from "./AgentExecutor.ts";
import AgentRuntime from "./AgentRuntime.ts";
import AgentRegistry from "./AgentRegistry.ts";
import {
  createAgentEvent,
  emitAgentEvent,
  emitToolExecutionEvent,
  type AgentEventHandler,
} from "./AgentEvent.ts";
import { createBuiltInAgentRegistry } from "./builtInAgents.ts";
import { createRootExecutionContext } from "./ExecutionContext.ts";
import RunBudget, {
  createRunAbortScope,
  DEFAULT_RUN_LIMITS,
  RunTimedOutError,
  type RunAbortScope,
  type RunLimits,
} from "./RunLimits.ts";

export type AgentGeneratorRunOptions = {
  readonly runId?: string;
  readonly threadId: string;
  readonly signal?: AbortSignal;
  readonly approval?: ToolApprovalHandler;
  readonly onChunk?: (chunk: string) => void | Promise<void>;
  readonly onAgentEvent?: AgentEventHandler;
};

export type AgentGeneratorOptions = {
  readonly approval?: ToolApprovalHandler;
  readonly policy?: ToolPolicy;
  readonly limits?: RunLimits;
  readonly model?: Model;
  readonly registry?: AgentRegistry;
  readonly toolResolver?: ToolResolver;
  readonly skillContextProvider?: SkillContextProvider;
  readonly executor?: AgentExecutor;
  readonly subagentRuntime?: AgentRuntime;
};

const delegationInstructions = [
  baseSystemPrompt,
  "You can use delegate_task to assign focused text analysis, rewriting, or review work to a specialist agent.",
  "Delegate only when a specialist would materially improve the result. Use the returned result to answer the user.",
].join("\n\n");

function createMainSystemPrompt(skillPrompt: string): string {
  return [delegationInstructions, skillPrompt].filter(Boolean).join("\n\n");
}

export default class AgentGenerator {
  private readonly registry: AgentRegistry;
  private readonly toolResolver: ToolResolver;
  private readonly subagentRuntime: AgentRuntime;
  private readonly executor: AgentExecutor;
  private readonly approval: ToolApprovalHandler;
  private readonly policy: ToolPolicy;
  private readonly limits: RunLimits;
  private readonly skillContextProvider?: SkillContextProvider;
  private readonly activeRuns = new Map<string, RunAbortScope>();

  constructor(options: AgentGeneratorOptions = {}) {
    const model = options.model ?? new AgentModel().getActiveAgent().model;
    this.registry = options.registry ?? createBuiltInAgentRegistry();
    this.toolResolver = options.toolResolver ?? new ToolResolver();
    this.approval = options.approval ?? denyToolApproval;
    this.policy = options.policy ?? new ToolPolicy();
    this.limits = options.limits ?? DEFAULT_RUN_LIMITS;
    this.skillContextProvider = options.skillContextProvider;
    this.executor = options.executor ?? new AgentExecutor(model);
    this.subagentRuntime = options.subagentRuntime ?? new AgentRuntime(
      this.registry,
      model,
      this.toolResolver,
      this.policy,
      this.approval,
      this.executor,
    );
  }

  cancelRun(
    runId: string,
    reason: unknown = new Error("Agent run cancelled by user."),
  ): boolean {
    const abortScope = this.activeRuns.get(runId);
    if (!abortScope || abortScope.signal.aborted) {
      return false;
    }

    abortScope.abort(reason);
    return true;
  }

  async run(
    input: string,
    options: AgentGeneratorRunOptions,
  ): Promise<string> {
    const abortScope = createRunAbortScope(
      this.limits.timeoutMs,
      options.signal,
    );
    const budget = new RunBudget(this.limits);
    const context = createRootExecutionContext({
      runId: options.runId,
      threadId: options.threadId,
      signal: abortScope.signal,
    });
    const delegateTaskTool = createDelegateTaskTool(
      this.subagentRuntime,
      this.registry,
      {
        parentThreadId: context.threadId,
        parentRunId: context.runId,
        parentDepth: context.depth,
        signal: context.signal,
        onEvent: options.onAgentEvent,
        budget,
        approval: options.approval ?? this.approval,
      },
    );
    const tools = guardTools([
      ...this.toolResolver.resolve(this.toolResolver.listNames()),
      delegateTaskTool,
    ], {
      policy: this.policy,
      approval: options.approval ?? this.approval,
      budget,
      onEvent: (event) =>
        emitToolExecutionEvent(options.onAgentEvent, context, event),
    });

    if (this.activeRuns.has(context.runId)) {
      throw new Error(`Run is already active: ${context.runId}`);
    }
    this.activeRuns.set(context.runId, abortScope);
    const initiallyAborted = context.signal?.aborted ?? false;

    try {
      const result = await this.executor.execute({
        context,
        prompt: input,
        systemPrompt: async () => {
          const skillContext = await this.skillContextProvider?.getSkillContext(input, {
            threadId: options.threadId,
          });
          if (skillContext && skillContext.selections.length > 0) {
            await emitAgentEvent(
              options.onAgentEvent,
              createAgentEvent(context, {
                type: "skill_selected",
                skills: skillContext.selections.map((selection) => Object.freeze({
                  id: selection.skill.manifest.id,
                  name: selection.skill.manifest.name,
                  score: selection.score,
                  reasons: selection.reasons,
                  matchedTerms: selection.matchedTerms,
                })),
              }),
            );
          }
          return createMainSystemPrompt(skillContext?.prompt ?? "");
        },
        tools,
        maxTurns: this.limits.maxTurns,
        mode: "stream",
        checkAbortAfterModel: true,
        timeout: {
          timedOut: abortScope.timedOut,
          timeoutMs: this.limits.timeoutMs,
        },
        onChunk: options.onChunk,
        onEvent: options.onAgentEvent,
      });

      switch (result.status) {
        case "completed":
          return result.content;
        case "timed_out":
          throw new RunTimedOutError(result.timeoutMs);
        case "aborted":
          if (initiallyAborted) {
            return "";
          }
          throw result.cause
            ?? context.signal?.reason
            ?? new Error("Agent run aborted.");
        case "failed":
          throw result.cause;
      }
    } finally {
      abortScope.dispose();
      this.activeRuns.delete(context.runId);
    }
  }
}
