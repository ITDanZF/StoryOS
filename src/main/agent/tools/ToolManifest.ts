import type { ClientTool } from "@langchain/core/tools";
import type { AgentContextKind, CapabilityId, EffectId } from "../runtime/capabilities.ts";

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
    description: tool.description ?? "",
    ...describeToolSecurity(tool.name),
  });
}
