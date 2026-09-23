import type { ClientTool } from "@langchain/core/tools";
import { describeToolSecurity as describeCoreToolSecurity } from "../../agent/tools/ToolManifest.ts";
import type { ToolManifest } from "../../agent/tools/ToolManifest.ts";
const READ_ONLY_TOOLS = new Set([
  "get_book_outline",
  "read_book_chapter",
  "search_book_chapters",
  "search_novel_passages",
  "find_similar_passages",
  "get_book_statistics",
  "get_active_editor_context",
  "inspect_active_editor_text",
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
    if (id.includes("book") || id === "search_novel_passages" || id === "find_similar_passages") {
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
  }
  if (BOOK_WRITE_TOOLS.has(id)) {
    return {
      provides: ["book.write"],
      effects: ["book.write"],
      requiredContexts: ["book-editor"],
      approval: id.startsWith("delete_") ? "ask" : "allow",
      risk: id.startsWith("delete_") ? "high" : "medium",
    };
  }
  if (EDITOR_WRITE_TOOLS.has(id)) {
    const navigationOnly = id === "open_book_chapter" || id === "select_active_editor_range";
    return {
      provides: ["editor.write"],
      effects: ["editor.write"],
      requiredContexts: ["book-editor"],
      approval: "allow",
      risk: navigationOnly ? "low" : "medium",
    };
  }
  return describeCoreToolSecurity(id);
}

export function createToolManifest(tool: ClientTool): ToolManifest {
  return Object.freeze({
    id: tool.name,
    title: tool.name,
    description: tool.description ?? "",
    ...describeToolSecurity(tool.name),
  });
}
