import type { AgentTurnInput } from "../../application/contracts.ts";
import ToolAccessResolver from "../../tools/ToolAccessResolver.ts";
import type { DirectExecutionPlan, ExecutionRequirements, ProposedTask } from "./contracts.ts";
import AgentMatcher from "./AgentMatcher.ts";

export type ExecutionRoute = "direct" | "planned";

export default class ExecutionRouter {
  constructor(
    private readonly matcher: AgentMatcher,
    private readonly tools: ToolAccessResolver,
  ) {}

  decide(requirements: ExecutionRequirements): ExecutionRoute {
    if (requirements.effects.length > 0) return "direct";
    if (requirements.decomposition === "forbidden") return "direct";
    const candidate: ProposedTask = {
      id: "route_probe",
      title: "Route probe",
      objective: "Check whether a planned agent can satisfy the request.",
      dependsOn: [],
      required: true,
      expectedOutput: "text",
      acceptanceCriteria: ["Complete"],
      requirements,
      timeoutMs: 1_000,
      maxAttempts: 1,
    };
    return this.matcher.hasCandidate(candidate) ? "planned" : "direct";
  }

  createDirectPlan(
    input: AgentTurnInput,
    requirements: ExecutionRequirements,
  ): DirectExecutionPlan {
    return Object.freeze({
      version: 2,
      planId: `plan_${crypto.randomUUID()}`,
      mode: "direct",
      goal: input.message.content,
      requirements,
      grantedToolIds: this.tools.forDirect(requirements).toolIds,
    });
  }
}

