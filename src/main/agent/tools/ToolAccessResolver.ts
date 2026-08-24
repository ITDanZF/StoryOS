import { coversAll, type AgentContextKind } from "../Agent/capabilities.ts";
import type { AgentDefinition } from "../Agent/types.ts";
import type { ExecutionRequirements } from "../Agent/orchestration/contracts.ts";
import ToolRegistry from "./ToolRegistry.ts";

export type ExecutionGrant = {
  readonly toolIds: readonly string[];
};

function contextMatches(
  required: readonly AgentContextKind[],
  available: readonly AgentContextKind[],
): boolean {
  return required.length === 0 || coversAll(available, required);
}

export default class ToolAccessResolver {
  constructor(private readonly registry: ToolRegistry) {}

  forAgent(
    agent: AgentDefinition,
    requirements: ExecutionRequirements,
  ): ExecutionGrant {
    const toolIds = agent.allowedToolIds.filter((id) => {
      const manifest = this.registry.getManifest(id);
      return coversAll(requirements.effects, manifest.effects)
        && contextMatches(manifest.requiredContexts, requirements.contextKinds);
    });
    return Object.freeze({ toolIds: Object.freeze(toolIds) });
  }

  forDirect(requirements: ExecutionRequirements): ExecutionGrant {
    const toolIds = this.registry.list()
      .map(({ manifest }) => manifest)
      .filter((manifest) => coversAll(requirements.effects, manifest.effects))
      .filter((manifest) => contextMatches(
        manifest.requiredContexts,
        requirements.contextKinds,
      ))
      .map((manifest) => manifest.id);
    return Object.freeze({ toolIds: Object.freeze(toolIds) });
  }
}

