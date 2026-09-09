export type AgentFailureCode =
  | "routing.no_capable_agent"
  | "planning.invalid_plan"
  | "planning.effect_not_allowed"
  | "tool.invalid_input"
  | "tool.path_outside_workspace"
  | "tool.permission_denied"
  | "tool.execution_failed"
  | "review.criteria_failed"
  | "run.cancelled"
  | "run.timed_out"
  | "run.failed";

export type AgentFailurePhase = "routing" | "planning" | "execution" | "review";
