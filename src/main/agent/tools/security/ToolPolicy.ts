import type { ToolApprovalDecision } from "../../../../shared/engine/toolApproval.ts";
import { describeToolSecurity } from "../ToolManifest.ts";
export type { ToolApprovalDecision } from "../../../../shared/engine/toolApproval.ts";
export type ToolPermission = "allow" | "ask" | "deny";

export type ToolApprovalRequest = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly summary: string;
  readonly input: unknown;
};

export type ToolApprovalHandler = (request: ToolApprovalRequest) => Promise<ToolApprovalDecision>;

export default class ToolPolicy {
  constructor(
    private readonly describe: typeof describeToolSecurity = describeToolSecurity,
    readonly summarizeInput?: (toolName: string, input: unknown) => string | undefined,
  ) {}
  private readonly sessionAllowedTools = new Set<string>();

  getPermission(toolName: string, input?: unknown): ToolPermission {
    if (this.sessionAllowedTools.has(toolName)) {
      return "allow";
    }

    let permission: ToolPermission;
    try {
      permission = this.describe(toolName).approval;
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
    if (permission === "ask" && toolName === "merge_text" && input && typeof input === "object") {
      const values = input as Record<string, unknown>;
      if (typeof values.output_path !== "string" || values.preview_only === true) {
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
