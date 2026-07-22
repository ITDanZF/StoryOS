import AgentRegistry from "../AgentRegistry.ts";
import { isAgentPlanningEligible } from "../AgentPlanning.ts";
import type { ExecutionPlan } from "./contracts.ts";
import type {
  OrchestrationTextModel,
  PlanProvider,
  PlanningRequest,
} from "./ports.ts";
import PlanValidator from "./PlanValidator.ts";
import { parseJsonObject } from "./json.ts";
import { executionPlanDraftSchema } from "./schemas.ts";

const plannerSystemPrompt = [
  "You are the planning component of an agent runtime.",
  "Return exactly one JSON object and no prose.",
  "Use direct mode for simple conversation, file mutations, tool-driven work, or tasks that do not materially benefit from specialists.",
  "Use planned mode only for multi-step read-only text analysis, rewriting, review, extraction, or comparison.",
  "Every planned task must use one available agent, have sideEffect none, and declare all required fields.",
  "Keep plans minimal. Never create more than 6 tasks.",
].join("\n");

function describeFormat(): string {
  return [
    "Direct JSON:",
    '{"version":1,"mode":"direct","goal":"..."}',
    "Planned JSON:",
    '{"version":1,"mode":"planned","goal":"...","tasks":[{"id":"task_a","title":"...","objective":"...","agentType":"text-analyzer","dependsOn":[],"required":true,"expectedOutput":"...","acceptanceCriteria":["..."],"sideEffect":"none","timeoutMs":30000,"maxAttempts":2}],"finalAcceptanceCriteria":["..."]}',
  ].join("\n");
}

export default class TaskPlanner implements PlanProvider {
  private readonly validator: PlanValidator;

  constructor(
    private readonly model: OrchestrationTextModel,
    private readonly registry: AgentRegistry,
    validator?: PlanValidator,
  ) {
    this.validator = validator ?? new PlanValidator(registry);
  }

  async createPlan(request: PlanningRequest): Promise<ExecutionPlan> {
    const availableAgents = this.registry.list()
      .filter(isAgentPlanningEligible)
      .map((agent) => `${agent.id}: ${agent.description}`)
      .join("\n");
    const basePrompt = [
      `Goal:\n${request.goal}`,
      `Available agents:\n${availableAgents}`,
      describeFormat(),
    ].join("\n\n");

    let previousOutput = "";
    let previousError = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const correction = attempt === 1
        ? ""
        : [
            "Your previous response was invalid.",
            `Validation error: ${previousError}`,
            `Previous response:\n${previousOutput}`,
            "Return a corrected JSON object.",
          ].join("\n\n");
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
        const draft = executionPlanDraftSchema.parse(parseJsonObject(previousOutput));
        const plan = Object.freeze({
          ...draft,
          planId: `plan_${crypto.randomUUID()}`,
        }) as ExecutionPlan;
        return this.validator.validate(plan);
      } catch (error) {
        previousError = error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error(`Planner returned an invalid plan: ${previousError}`);
  }
}
