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
    delegate_task: "allow",
    write_file: "ask",
    edit_file: "ask",
    create_skill: "ask",
  });

export default class ToolPolicy {
  private readonly sessionAllowedTools = new Set<string>();

  constructor(
    private readonly permissions: Readonly<Record<string, ToolPermission>> =
      DEFAULT_PERMISSIONS,
  ) {}

  getPermission(toolName: string): ToolPermission {
    if (this.sessionAllowedTools.has(toolName)) {
      return "allow";
    }

    return this.permissions[toolName] ?? "deny";
  }

  allowForSession(toolName: string): void {
    this.sessionAllowedTools.add(toolName);
  }
}

export function denyToolApproval(): Promise<ToolApprovalDecision> {
  return Promise.resolve("deny");
}
