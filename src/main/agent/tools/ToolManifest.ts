import type { ClientTool } from "@langchain/core/tools";
import type {
  AgentContextKind,
  CapabilityId,
  EffectId,
} from "../Agent/capabilities.ts";

export type ToolRisk = "low" | "medium" | "high";

export type ToolManifest = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly provides: readonly CapabilityId[];
  readonly effects: readonly EffectId[];
  readonly requiredContexts: readonly AgentContextKind[];
  readonly approval: "allow" | "ask" | "deny";
  readonly risk: ToolRisk;
};

export type RegisteredTool = {
  readonly manifest: ToolManifest;
  readonly implementation: ClientTool;
};

const READ_ONLY_TOOLS = new Set([
  "read_file",
  "list_files",
  "search_text",
  "text_stats",
  "compare_text",
  "extract_text",
  "split_text",
  "validate_text",
  "inspect_text",
  "analyze_text_structure",
  "ranked_search_text",
  "find_similar_text",
  "select_text_context",
  "get_book_outline",
  "read_book_chapter",
  "search_book_chapters",
  "get_book_statistics",
  "get_active_editor_context",
  "inspect_active_editor_text",
  "delegate_task",
]);

const WORKSPACE_WRITE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "edit_text_range",
  "batch_edit_text",
  "normalize_text",
  "replace_text",
  "transform_lines",
  "merge_text",
]);

const BOOK_WRITE_TOOLS = new Set([
  "create_project_book",
  "update_book_profile",
  "create_book_volume",
  "update_book_volume",
  "delete_book_volume",
  "create_book_chapter",
  "update_book_chapter",
  "delete_book_chapter",
  "replace_book_chapter_text",
  "rewrite_book_chapter_text",
  "generate_book_chapter_content",
]);

const EDITOR_WRITE_TOOLS = new Set([
  "replace_active_editor_range",
  "format_active_editor_selection",
  "style_active_editor_selection",
  "apply_active_editor_styles",
  "manage_active_editor_page",
  "open_book_chapter",
  "select_active_editor_range",
]);

export function describeToolSecurity(
  id: string,
): Omit<ToolManifest, "id" | "title" | "description"> {
  if (READ_ONLY_TOOLS.has(id)) {
    if (id === "delegate_task") {
      return {
        provides: [],
        effects: [],
        requiredContexts: [],
        approval: "allow",
        risk: "low",
      };
    }
    if (id.includes("book")) {
      return {
        provides: ["book.read"],
        effects: [],
        requiredContexts: ["book-editor"],
        approval: "allow",
        risk: "low",
      };
    }
    if (id.includes("editor")) {
      return {
        provides: ["editor.read"],
        effects: [],
        requiredContexts: ["book-editor"],
        approval: "allow",
        risk: "low",
      };
    }
    const provides: CapabilityId[] = ["workspace.read"];
    if (id.includes("search") || id.includes("similar")) provides.push("text.search");
    if (id !== "list_files" && id !== "read_file") provides.push("text.inspect");
    return {
      provides,
      effects: [],
      requiredContexts: [],
      approval: "allow",
      risk: "low",
    };
  }
  if (WORKSPACE_WRITE_TOOLS.has(id)) {
    return {
      provides: ["text.rewrite", "workspace.write"],
      effects: ["workspace.write"],
      requiredContexts: [],
      approval: "ask",
      risk: "medium",
    };
  }
  if (BOOK_WRITE_TOOLS.has(id)) {
    return {
      provides: ["book.write"],
      effects: ["book.write"],
      requiredContexts: ["book-editor"],
      approval: "ask",
      risk: id.startsWith("delete_") ? "high" : "medium",
    };
  }
  if (EDITOR_WRITE_TOOLS.has(id)) {
    const navigationOnly = id === "open_book_chapter" || id === "select_active_editor_range";
    return {
      provides: ["editor.write"],
      effects: ["editor.write"],
      requiredContexts: ["book-editor"],
      approval: navigationOnly ? "allow" : "ask",
      risk: navigationOnly ? "low" : "medium",
    };
  }
  if (id === "create_skill") {
    return {
      provides: ["skill.write"],
      effects: ["skill.write"],
      requiredContexts: [],
      approval: "ask",
      risk: "medium",
    };
  }
  throw new Error(`Tool manifest is required: ${id}`);
}

export function createToolManifest(tool: ClientTool): ToolManifest {
  return Object.freeze({
    id: tool.name,
    title: tool.name,
    description: tool.description,
    ...describeToolSecurity(tool.name),
  });
}
