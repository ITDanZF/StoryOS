import PromptCompiler from "../../runtime/PromptCompiler.ts";
import AgentFailure from "../../errors/AgentFailure.ts";
import type { PlannedExecutionPlan, ProposedExecutionPlan } from "./contracts.ts";
import type { OrchestrationTextModel, PlanProvider, PlanningRequest } from "./ports.ts";
import AgentMatcher from "./AgentMatcher.ts";
import PlanValidator from "./PlanValidator.ts";
import { parseJsonObject } from "./json.ts";
import { proposedPlanDraftSchema } from "./schemas.ts";

const plannerSystemPrompt = [
  "You are the planning component of an agent runtime.",
  "Return exactly one JSON object and no prose.",
  "Create only read-only specialist tasks. Never choose an agent by name.",
  "Each task declares capabilities, effects, contextKinds, outputKind, and decomposition.",
  "Each task contextKinds must use only context kinds supplied by the top-level requirements.",
  "Task effects must always be an empty array.",
  "Keep plans minimal. Never create more than 6 tasks.",
].join("\n");

function describeFormat(contextKinds: readonly string[]): string {
  return [
    "Planned JSON:",
    `{"version":2,"mode":"planned","goal":"...","tasks":[{"id":"task_a","title":"...","objective":"...","dependsOn":[],"required":true,"expectedOutput":"...","acceptanceCriteria":["..."],"requirements":{"capabilities":["text.inspect"],"effects":[],"contextKinds":${JSON.stringify(contextKinds)},"outputKind":"text","decomposition":"forbidden"},"timeoutMs":30000,"maxAttempts":2}],"finalAcceptanceCriteria":["..."]}`,
  ].join("\n");
}

export default class TaskPlanner implements PlanProvider {
  private readonly promptCompiler = new PromptCompiler();

  constructor(
    private readonly model: OrchestrationTextModel,
    private readonly matcher: AgentMatcher,
    private readonly validator: PlanValidator,
  ) {}

  async createPlan(request: PlanningRequest): Promise<PlannedExecutionPlan> {
    if (request.requirements.effects.length > 0) {
      throw new AgentFailure(
        "planning.effect_not_allowed",
        "planning",
        "包含副作用的请求不能进入 planned 模式。",
        false,
      );
    }
    const basePrompt = [
      `Goal and trusted context:\n${this.promptCompiler.compile(request.input)}`,
      `Top-level requirements:\n${JSON.stringify(request.requirements)}`,
      describeFormat(request.requirements.contextKinds),
    ].join("\n\n");

    let previousOutput = "";
    let previousError = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const correction = attempt === 1 ? "" : [
        "Your previous response was invalid.",
        `Validation error: ${previousError}`,
        `Previous response:\n${previousOutput}`,
        "Return a corrected JSON object.",
      ].join("\n\n");
      request.budget?.consumeModelTurn("planner model run");
      previousOutput = await this.model.invokeText({
        prompt: [basePrompt, correction].filter(Boolean).join("\n\n"),
        threadId: `${request.threadId}/orchestration/planner/${request.runId}`,
        systemPrompt: plannerSystemPrompt,
        tools: [],
        maxTurns: 1,
        visibility: "internal",
        signal: request.signal,
      });

      try {
        const draft = proposedPlanDraftSchema.parse(parseJsonObject(previousOutput));
        const proposed: ProposedExecutionPlan = Object.freeze({
          ...draft,
          planId: `plan_${crypto.randomUUID()}`,
          requirements: request.requirements,
        });
        const assigned: PlannedExecutionPlan = Object.freeze({
          ...proposed,
          tasks: Object.freeze(proposed.tasks.map((task) => this.matcher.assign(task))),
        });
        return this.validator.validate(assigned);
      } catch (error) {
        previousError = error instanceof Error ? error.message : String(error);
      }
    }
    throw new AgentFailure(
      "planning.invalid_plan",
      "planning",
      `Planner returned an invalid plan: ${previousError}`,
      false,
    );
  }
}
