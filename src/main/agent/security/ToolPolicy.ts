export type ToolPermission = "allow" | "ask" | "deny";

export type ToolApprovalDecision = "allow_once" | "allow_session" | "deny";

export type ToolApprovalRequest = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly summary: string;
  readonly input: unknown;
};

export type ToolApprovalHandler = (
  request: ToolApprovalRequest,
) => Promise<ToolApprovalDecision>;

export default class ToolPolicy {
  private readonly sessionAllowedTools = new Set<string>();

  getPermission(toolName: string, input?: unknown): ToolPermission {
    if (this.sessionAllowedTools.has(toolName)) {
      return "allow";
    }

    let permission: ToolPermission;
    try {
      permission = describeToolSecurity(toolName).approval;
    } catch {
      permission = "deny";
    }
    if (
      permission === "ask" &&
      [
        "edit_text_range",
        "batch_edit_text",
        "normalize_text",
        "replace_text",
        "transform_lines",
      ].includes(toolName) &&
      input &&
      typeof input === "object"
    ) {
      const values = input as Record<string, unknown>;
      if (typeof values.text === "string" || values.preview_only === true) {
        return "allow";
      }
    }
    if (
      permission === "ask" &&
      toolName === "merge_text" &&
      input &&
      typeof input === "object"
    ) {
      const values = input as Record<string, unknown>;
      if (
        typeof values.output_path !== "string" ||
        values.preview_only === true
      ) {
        return "allow";
      }
    }
    return permission;
  }

  allowForSession(toolName: string): void {
    this.sessionAllowedTools.add(toolName);
  }
}

export function denyToolApproval(): Promise<ToolApprovalDecision> {
  return Promise.resolve("deny");
}
import { describeToolSecurity } from "../tools/ToolManifest.ts";
