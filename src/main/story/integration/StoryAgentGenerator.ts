import AgentGenerator, {
  type AgentGeneratorOptions,
  type AgentGeneratorRunOptions,
} from "../../agent/runtime/AgentGenerator.ts";
import type { AgentTurnInput } from "../../../shared/contracts/conversations/applicationContracts.ts";
import StoryToolResolver from "./StoryToolResolver.ts";
import StoryToolPolicy from "./StoryToolPolicy.ts";
import { baseSystemPrompt } from "../resources/prompts/baseSystem.prompt.ts";
import { toAgentInput } from "./StoryTurnAdapter.ts";
export type {
  AgentGeneratorOptions,
  AgentGeneratorRunOptions,
} from "../../agent/runtime/AgentGenerator.ts";
export default class StoryAgentGenerator extends AgentGenerator {
  constructor(options: AgentGeneratorOptions = {}) {
    super({
      ...options,
      toolResolver: options.toolResolver ?? new StoryToolResolver(),
      policy: options.policy ?? new StoryToolPolicy(),
      systemPrompt: baseSystemPrompt,
    });
  }
  override run(input: AgentTurnInput, options: AgentGeneratorRunOptions): Promise<string> {
    return super.run(toAgentInput(input), options);
  }
}
