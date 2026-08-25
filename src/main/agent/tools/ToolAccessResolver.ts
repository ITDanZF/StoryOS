import { coversAll, type AgentContextKind } from "../Agent/capabilities.ts";
import type { AgentDefinition } from "../Agent/types.ts";
import type { ExecutionRequirements } from "../Agent/orchestration/contracts.ts";
import ToolRegistry from "./ToolRegistry.ts";
import type { ToolManifest } from "./ToolManifest.ts";

export type ExecutionGrant = {
  readonly toolIds: readonly string[];
};

function contextMatches(
  required: readonly AgentContextKind[],
  available: readonly AgentContextKind[],
): boolean {
  return required.length === 0 || coversAll(available, required);
}

const SAFE_BOOK_EDITOR_WRITE_TOOLS = new Set([
  "create_project_book",
  "update_book_profile",
  "create_book_volume",
  "update_book_volume",
  "create_book_chapter",
  "update_book_chapter",
  "replace_book_chapter_text",
  "rewrite_book_chapter_text",
  "generate_book_chapter_content",
  "replace_active_editor_range",
  "format_active_editor_selection",
  "style_active_editor_selection",
  "apply_active_editor_styles",
  "manage_active_editor_page",
  "open_book_chapter",
  "select_active_editor_range",
]);

function isBookEditorContext(requirements: ExecutionRequirements): boolean {
  return requirements.contextKinds.includes("book-editor");
}

function grantsRequiredEffects(
  manifest: ToolManifest,
  requirements: ExecutionRequirements,
): boolean {
  if (coversAll(requirements.effects, manifest.effects)) return true;
  return isBookEditorContext(requirements) &&
    SAFE_BOOK_EDITOR_WRITE_TOOLS.has(manifest.id);
}

export default class ToolAccessResolver {
  constructor(private readonly registry: ToolRegistry) {}

  forAgent(
    agent: AgentDefinition,
    requirements: ExecutionRequirements,
  ): ExecutionGrant {
    const toolIds = agent.allowedToolIds.filter((id) => {
      const manifest = this.registry.getManifest(id);
      return grantsRequiredEffects(manifest, requirements)
        && contextMatches(manifest.requiredContexts, requirements.contextKinds);
    });
    return Object.freeze({ toolIds: Object.freeze(toolIds) });
  }

  forDirect(requirements: ExecutionRequirements): ExecutionGrant {
    const toolIds = this.registry.list()
      .map(({ manifest }) => manifest)
      .filter((manifest) => grantsRequiredEffects(manifest, requirements))
      .filter((manifest) => contextMatches(
        manifest.requiredContexts,
        requirements.contextKinds,
      ))
      .map((manifest) => manifest.id);
    return Object.freeze({ toolIds: Object.freeze(toolIds) });
  }
}
