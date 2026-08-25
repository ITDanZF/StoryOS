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
import type { AgentTurnInput } from "../application/contracts.ts";
import PromptCompiler from "../runtime/PromptCompiler.ts";
import type { EffectId } from "./capabilities.ts";
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
  readonly budget?: RunBudget;
  readonly approval?: ToolApprovalHandler;
  readonly onChunk?: (chunk: string) => void | Promise<void>;
  readonly onAgentEvent?: AgentEventHandler;
  readonly grantedToolIds: readonly string[];
  readonly requiredEffects?: readonly EffectId[];
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

const REQUIRED_EFFECT_RETRY_INSTRUCTION = `
<storyos_required_action>
上一轮没有完成用户要求的实际写入。本轮禁止只说明接下来准备做什么。
你必须调用可用工具完成至少一次实际写入后才能给出最终答复。
如果当前书籍为空且用户要求编写第一章：先读取书籍大纲，创建第一卷（如有必要）和第一章，再调用 generate_book_chapter_content 生成并保存正文。
如果确实缺少无法合理推断的关键信息，应明确说明缺少什么；不要用“我先查看”“接下来处理”等过程说明作为最终答复。
</storyos_required_action>
`.trim();

const CHAPTER_PROSE_REQUEST_PATTERN = /(?:创作|续写|生成|完成|补全|编写|写).*(?:第.{0,8}章|章节|正文)|(?:第.{0,8}章|章节|正文).*(?:创作|续写|生成|完成|补全|编写|写)/i;

class RequiredEffectNotCompletedError extends Error {
  constructor(effects: readonly EffectId[]) {
    super(`AI 未执行完成本次写入操作：${effects.join(", ")}`);
    this.name = "RequiredEffectNotCompletedError";
  }
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
  private readonly promptCompiler = new PromptCompiler();

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
    input: AgentTurnInput,
    options: AgentGeneratorRunOptions,
  ): Promise<string> {
    const abortScope = createRunAbortScope(
      this.limits.timeoutMs,
      options.signal,
    );
    const budget = options.budget ?? new RunBudget(this.limits);
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
    const requiredEffects = [...new Set(options.requiredEffects ?? [])];
    const requiredToolIds = new Set(
      options.grantedToolIds.filter((toolId) => {
        const effects = this.toolResolver.registry.getManifest(toolId).effects;
        return requiredEffects.some((effect) => effects.includes(effect));
      }),
    );
    const generationToolId = "generate_book_chapter_content";
    const completionToolIds = CHAPTER_PROSE_REQUEST_PATTERN.test(input.message.content)
      && requiredToolIds.has(generationToolId)
      ? new Set([generationToolId])
      : requiredToolIds;
    let requiredEffectResolved = requiredEffects.length === 0;
    const tools = guardTools([
      ...this.toolResolver.resolve(options.grantedToolIds),
      delegateTaskTool,
    ], {
      policy: this.policy,
      approval: options.approval ?? this.approval,
      budget,
      onEvent: async (event) => {
        if (
          (
            event.type === "tool_completed"
            && completionToolIds.has(event.request.toolName)
          )
          || (
            requiredToolIds.has(event.request.toolName)
            && ["tool_rejected", "tool_failed"].includes(event.type)
          )
        ) {
          requiredEffectResolved = true;
        }
        await emitToolExecutionEvent(options.onAgentEvent, context, event);
      },
    });

    if (this.activeRuns.has(context.runId)) {
      throw new Error(`Run is already active: ${context.runId}`);
    }
    this.activeRuns.set(context.runId, abortScope);
    const initiallyAborted = context.signal?.aborted ?? false;

    try {
      const systemPrompt = async () => {
          const skillContext = await this.skillContextProvider?.getSkillContext(input.message.content, {
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
        };
      const compiledPrompt = this.promptCompiler.compile(input);
      const execute = (prompt: string, buffered: boolean) => {
        const bufferedChunks: string[] = [];
        const bufferedEvents: Parameters<NonNullable<AgentEventHandler>>[0][] = [];
        return {
          bufferedChunks,
          bufferedEvents,
          result: this.executor.execute({
            context,
            prompt,
            systemPrompt,
            tools,
            maxTurns: this.limits.maxTurns,
            mode: "stream",
            checkAbortAfterModel: true,
            timeout: {
              timedOut: abortScope.timedOut,
              timeoutMs: this.limits.timeoutMs,
            },
            budget,
            onChunk: buffered
              ? (chunk) => { bufferedChunks.push(chunk); }
              : options.onChunk,
            onEvent: buffered
              ? (event) => { bufferedEvents.push(event); }
              : options.onAgentEvent,
          }),
        };
      };

      const needsCompletionGuard = requiredEffects.length > 0 && requiredToolIds.size > 0;
      if (!needsCompletionGuard) {
        return await this.resolveExecutionResult(
          await execute(compiledPrompt, false).result,
          initiallyAborted,
        );
      }

      let attempt = execute(compiledPrompt, true);
      let result = await attempt.result;
      if (result.status === "completed" && !requiredEffectResolved) {
        attempt = execute(`${REQUIRED_EFFECT_RETRY_INSTRUCTION}\n\n${compiledPrompt}`, true);
        result = await attempt.result;
      }

      if (result.status === "completed" && !requiredEffectResolved) {
        throw new RequiredEffectNotCompletedError(requiredEffects);
      }

      for (const event of attempt.bufferedEvents) {
        await options.onAgentEvent?.(event);
      }
      for (const chunk of attempt.bufferedChunks) {
        await options.onChunk?.(chunk);
      }

      return await this.resolveExecutionResult(result, initiallyAborted);
    } finally {
      abortScope.dispose();
      this.activeRuns.delete(context.runId);
    }
  }

  private async resolveExecutionResult(
    result: Awaited<ReturnType<AgentExecutor["execute"]>>,
    initiallyAborted: boolean,
  ): Promise<string> {
    switch (result.status) {
      case "completed":
        return result.content;
      case "timed_out":
        throw new RunTimedOutError(result.timeoutMs);
      case "aborted":
        if (initiallyAborted) return "";
        throw result.cause ?? new Error("Agent run aborted.");
      case "failed":
        throw result.cause;
    }
  }
}
