import type { ToolApprovalRequest } from "./ToolPolicy.ts";

const MAX_PREVIEW_LENGTH = 4_000;

function truncate(value: string): string {
  if (value.length <= MAX_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_PREVIEW_LENGTH)}\n… preview truncated …`;
}

function describeEditorSelector(value: unknown): string {
  if (!value || typeof value !== "object") return "未知目标";
  const selector = value as Record<string, unknown>;
  if (selector.kind === "text") {
    const text = typeof selector.text === "string" ? selector.text : "<未知文本>";
    const expectedCount = typeof selector.expected_count === "number"
      ? selector.expected_count
      : "?";
    const occurrences = selector.occurrences;
    const selectedCount = occurrences && typeof occurrences === "object" &&
      Array.isArray((occurrences as Record<string, unknown>).indices)
      ? ((occurrences as Record<string, unknown>).indices as unknown[]).length
      : expectedCount;
    return `“${text}”：${selectedCount} 处（全文匹配 ${expectedCount} 处）`;
  }
  if (selector.kind === "ranges" && Array.isArray(selector.ranges)) {
    return `明确文本范围：${selector.ranges.length} 处`;
  }
  return "未知目标";
}

function describeEditorStyle(value: unknown): string {
  if (!value || typeof value !== "object") return "未知格式";
  const style = value as Record<string, unknown>;
  switch (style.kind) {
    case "text_color":
      return `文字颜色 ${String(style.value ?? "清除")}`;
    case "background_color":
      return `背景高亮 ${String(style.value ?? "清除")}`;
    case "mark":
      return `${String(style.mark)}：${style.enabled === true ? "启用" : "移除"}`;
    case "link":
      return `链接 ${String(style.href ?? "移除")}`;
    case "paragraph":
      return "段落格式";
    case "clear_inline":
      return "清除行内格式";
    default:
      return "未知格式";
  }
}

export function createToolApprovalPreview(
  request: ToolApprovalRequest,
): string {
  if (!request.input || typeof request.input !== "object") {
    return "";
  }

  const input = request.input as Record<string, unknown>;

  if (request.toolName === "edit_file") {
    const oldValue =
      typeof input.old_string === "string" ? input.old_string : "";
    const newValue =
      typeof input.new_string === "string" ? input.new_string : "";
    return truncate(
      ["--- existing", oldValue, "+++ proposed", newValue].join("\n"),
    );
  }

  if (request.toolName === "write_file") {
    const content = typeof input.content === "string" ? input.content : "";
    return truncate(["+++ proposed content", content].join("\n"));
  }

  if (request.toolName === "create_skill") {
    const id = typeof input.id === "string" ? input.id : "<unknown>";
    const content = typeof input.content === "string" ? input.content : "";
    return truncate(
      [
        `Create Skill: ${id}`,
        `Target: ~/.mini-agent/skills/user/${id}/SKILL.md`,
        "",
        "+++ proposed SKILL.md",
        content,
      ].join("\n"),
    );
  }

  if (request.toolName === "apply_active_editor_styles") {
    const operations = Array.isArray(input.operations) ? input.operations : [];
    return truncate([
      "批量格式化当前章节",
      `版本：${String(input.expected_version ?? "未知")}`,
      `操作组：${operations.length}`,
      "",
      ...operations.map((operation, index) => {
        const value = operation && typeof operation === "object"
          ? operation as Record<string, unknown>
          : {};
        return `${index + 1}. ${describeEditorSelector(value.selector)} → ${describeEditorStyle(value.style)}`;
      }),
    ].join("\n"));
  }

  if (
    request.toolName === "edit_text_range" ||
    request.toolName === "batch_edit_text" ||
    request.toolName === "normalize_text" ||
    request.toolName === "replace_text" ||
    request.toolName === "transform_lines" ||
    request.toolName === "merge_text"
  ) {
    return truncate(
      [
        `Text operation: ${request.toolName}`,
        `Target: ${request.toolName === "merge_text" ? (typeof input.output_path === "string" ? input.output_path : "inline result") : typeof input.path === "string" ? input.path : "inline text"}`,
        "",
        JSON.stringify(input, null, 2),
      ].join("\n"),
    );
  }

  return "";
}
