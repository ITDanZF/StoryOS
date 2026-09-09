import { coversAll, type AgentContextKind } from "../runtime/capabilities.ts";
import type { ExecutionRequirements } from "../orchestration/contracts.ts";
import type { AgentDefinition } from "../runtime/types.ts";
import type { ToolManifest } from "./ToolManifest.ts";
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
  constructor(
    private readonly registry: ToolRegistry,
    private readonly grantsEffects: (
      manifest: ToolManifest,
      requirements: ExecutionRequirements,
    ) => boolean = (manifest, requirements) => coversAll(requirements.effects, manifest.effects),
  ) {}

  forAgent(agent: AgentDefinition, requirements: ExecutionRequirements): ExecutionGrant {
    const toolIds = agent.allowedToolIds.filter((id) => {
      const manifest = this.registry.getManifest(id);
      return (
        this.grantsEffects(manifest, requirements) &&
        contextMatches(manifest.requiredContexts, requirements.contextKinds)
      );
    });
    return Object.freeze({ toolIds: Object.freeze(toolIds) });
  }

  forDirect(requirements: ExecutionRequirements): ExecutionGrant {
    const toolIds = this.registry
      .list()
      .map(({ manifest }) => manifest)
      .filter((manifest) => this.grantsEffects(manifest, requirements))
      .filter((manifest) => contextMatches(manifest.requiredContexts, requirements.contextKinds))
      .map((manifest) => manifest.id);
    return Object.freeze({ toolIds: Object.freeze(toolIds) });
  }
}
