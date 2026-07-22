import type { AgentDefinition } from "./types.ts";

export function isAgentPlanningEligible(agent: AgentDefinition): boolean {
  const value = agent.metadata?.planningEligible;
  return typeof value === "boolean" ? value : true;
}
