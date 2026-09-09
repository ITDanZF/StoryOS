import type { AgentTurnInput } from "../../../shared/contracts/conversations/applicationContracts.ts";
import {
  createAgentOrchestrator as createEngine,
  type AgentOrchestratorFactoryOptions as EngineOptions,
} from "../../agent/orchestration/createAgentOrchestrator.ts";
import type { AgentOrchestratorRunOptions } from "../../agent/orchestration/AgentOrchestrator.ts";
import type { RunLimits } from "../../agent/runtime/RunLimits.ts";
import { builtInAgents } from "../../agent/runtime/builtInAgents.ts";
import type { CreateToolsOptions } from "./createStoryTools.ts";
import StoryToolResolver from "./StoryToolResolver.ts";
import StoryToolPolicy from "./StoryToolPolicy.ts";
import { grantsStoryEffects } from "./StoryToolAccess.ts";
import { toAgentInput } from "./StoryTurnAdapter.ts";
import { baseSystemPrompt } from "../resources/prompts/baseSystem.prompt.ts";
export type AgentOrchestratorFactoryOptions = EngineOptions & CreateToolsOptions;
export function createAgentOrchestrator(options: AgentOrchestratorFactoryOptions | RunLimits = {}) {
  const settings: AgentOrchestratorFactoryOptions =
    "maxTurns" in options ? { limits: options } : options;
  const engine = createEngine({
    ...settings,
    toolResolver: settings.toolResolver ?? new StoryToolResolver(settings),
    policy: settings.policy ?? new StoryToolPolicy(),
    agents:
      settings.agents ??
      builtInAgents.map((agent) => ({ ...agent, acceptedContexts: ["global", "book-editor"] })),
    skillContexts: ["global", "book-editor"],
    grantsEffects: grantsStoryEffects,
    systemPrompt: baseSystemPrompt,
  });
  return {
    run: (input: AgentTurnInput, runOptions: AgentOrchestratorRunOptions) =>
      engine.run(toAgentInput(input), runOptions),
    cancelRun: (runId: string, reason?: unknown) => engine.cancelRun(runId, reason),
  };
}
