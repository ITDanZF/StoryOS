import { coversAll } from "../../agent/runtime/capabilities.ts";
import type { ExecutionRequirements } from "../../agent/orchestration/contracts.ts";
import type { ToolManifest } from "../../agent/tools/ToolManifest.ts";
import { NARRATIVE_OUTLINE_TOOL_IDS } from "./StoryToolManifest.ts";

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

export function grantsStoryEffects(
  manifest: ToolManifest,
  requirements: ExecutionRequirements,
): boolean {
  if (NARRATIVE_OUTLINE_TOOL_IDS.has(manifest.id)) return false;
  if (coversAll(requirements.effects, manifest.effects)) return true;
  return isBookEditorContext(requirements) && SAFE_BOOK_EDITOR_WRITE_TOOLS.has(manifest.id);
}
