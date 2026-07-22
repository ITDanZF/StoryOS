import type { ToolApprovalRequest } from "./ToolPolicy.ts";

const MAX_PREVIEW_LENGTH = 4_000;

function truncate(value: string): string {
  if (value.length <= MAX_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_PREVIEW_LENGTH)}\n… preview truncated …`;
}

export function createToolApprovalPreview(
  request: ToolApprovalRequest,
): string {
  if (!request.input || typeof request.input !== "object") {
    return "";
  }

  const input = request.input as Record<string, unknown>;

  if (request.toolName === "edit_file") {
    const oldValue = typeof input.old_string === "string" ? input.old_string : "";
    const newValue = typeof input.new_string === "string" ? input.new_string : "";
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
    return truncate([
      `Create Skill: ${id}`,
      `Target: ~/.mini-agent/skills/user/${id}/SKILL.md`,
      "",
      "+++ proposed SKILL.md",
      content,
    ].join("\n"));
  }

  return "";
}
