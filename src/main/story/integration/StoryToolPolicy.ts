import ToolPolicy from "../../agent/tools/security/ToolPolicy.ts";
import { describeToolSecurity } from "./StoryToolManifest.ts";
function summarize(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const values = input as Record<string, unknown>;
  if (
    [
      "replace_book_chapter_text",
      "rewrite_book_chapter_text",
      "generate_book_chapter_content",
    ].includes(toolName)
  )
    return "Edit saved chapter text: " + String(values.chapter_id ?? "<unknown>");
  if (toolName === "apply_active_editor_styles") {
    const count = Array.isArray(values.operations) ? values.operations.length : 0;
    return "Apply " + count + " targeted editor style operation" + (count === 1 ? "" : "s");
  }
  return undefined;
}
export default class StoryToolPolicy extends ToolPolicy {
  constructor() {
    super(describeToolSecurity, summarize);
  }
}
export { denyToolApproval } from "../../agent/tools/security/ToolPolicy.ts";
export type {
  ToolApprovalHandler,
  ToolApprovalRequest,
  ToolPermission,
  ToolApprovalDecision,
} from "../../agent/tools/security/ToolPolicy.ts";
