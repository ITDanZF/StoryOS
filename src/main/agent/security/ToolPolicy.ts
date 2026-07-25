export type ToolPermission = "allow" | "ask" | "deny";

export type ToolApprovalDecision = "allow_once" | "allow_session" | "deny";

export type ToolApprovalRequest = {
  readonly toolName: string;
  readonly summary: string;
  readonly input: unknown;
};

export type ToolApprovalHandler = (
  request: ToolApprovalRequest,
) => Promise<ToolApprovalDecision>;

const DEFAULT_PERMISSIONS: Readonly<Record<string, ToolPermission>> =
  Object.freeze({
    read_file: "allow",
    list_files: "allow",
    search_text: "allow",
    text_stats: "allow",
    compare_text: "allow",
    extract_text: "allow",
    split_text: "allow",
    validate_text: "allow",
    delegate_task: "allow",
    write_file: "ask",
    edit_file: "ask",
    edit_text_range: "ask",
    batch_edit_text: "ask",
    normalize_text: "ask",
    create_skill: "ask",
  });

export default class ToolPolicy {
  private readonly sessionAllowedTools = new Set<string>();

  constructor(
    private readonly permissions: Readonly<Record<string, ToolPermission>> =
      DEFAULT_PERMISSIONS,
  ) {}

  getPermission(toolName: string, input?: unknown): ToolPermission {
    if (this.sessionAllowedTools.has(toolName)) {
      return "allow";
    }

    const permission = this.permissions[toolName] ?? "deny";
    if (
      permission === "ask" &&
      ["edit_text_range", "batch_edit_text", "normalize_text"].includes(toolName) &&
      input &&
      typeof input === "object"
    ) {
      const values = input as Record<string, unknown>;
      if (typeof values.text === "string" || values.preview_only === true) {
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
