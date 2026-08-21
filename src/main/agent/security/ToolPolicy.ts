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
    inspect_text: "allow",
    analyze_text_structure: "allow",
    ranked_search_text: "allow",
    find_similar_text: "allow",
    select_text_context: "allow",
    get_book_outline: "allow",
    read_book_chapter: "allow",
    search_book_chapters: "allow",
    get_book_statistics: "allow",
    get_active_editor_context: "allow",
    inspect_active_editor_text: "allow",
    select_active_editor_range: "allow",
    open_book_chapter: "allow",
    delegate_task: "allow",
    write_file: "ask",
    edit_file: "ask",
    edit_text_range: "ask",
    batch_edit_text: "ask",
    normalize_text: "ask",
    replace_text: "ask",
    transform_lines: "ask",
    merge_text: "ask",
    create_skill: "ask",
    replace_active_editor_range: "ask",
    format_active_editor_selection: "ask",
    style_active_editor_selection: "ask",
    apply_active_editor_styles: "ask",
    manage_active_editor_page: "ask",
    create_project_book: "ask",
    update_book_profile: "ask",
    create_book_volume: "ask",
    update_book_volume: "ask",
    delete_book_volume: "ask",
    create_book_chapter: "ask",
    update_book_chapter: "ask",
    delete_book_chapter: "ask",
  });

export default class ToolPolicy {
  private readonly sessionAllowedTools = new Set<string>();

  constructor(
    private readonly permissions: Readonly<
      Record<string, ToolPermission>
    > = DEFAULT_PERMISSIONS,
  ) {}

  getPermission(toolName: string, input?: unknown): ToolPermission {
    if (this.sessionAllowedTools.has(toolName)) {
      return "allow";
    }

    const permission = this.permissions[toolName] ?? "deny";
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
