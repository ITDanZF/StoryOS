import {
  DynamicStructuredTool,
  isStructuredTool,
  type ClientTool,
} from "@langchain/core/tools";
import type RunBudget from "../Agent/RunLimits.ts";
import ToolPolicy, {
  denyToolApproval,
  type ToolApprovalHandler,
  type ToolApprovalRequest,
} from "./ToolPolicy.ts";

export type ToolExecutionEvent =
  | { readonly type: "tool_started"; readonly toolCallId: string; readonly request: ToolApprovalRequest }
  | {
      readonly type: "tool_approval_requested";
      readonly toolCallId: string;
      readonly request: ToolApprovalRequest;
    }
  | { readonly type: "tool_approved"; readonly toolCallId: string; readonly request: ToolApprovalRequest }
  | { readonly type: "tool_rejected"; readonly toolCallId: string; readonly request: ToolApprovalRequest }
  | { readonly type: "tool_completed"; readonly toolCallId: string; readonly request: ToolApprovalRequest }
  | {
      readonly type: "tool_failed";
      readonly toolCallId: string;
      readonly request: ToolApprovalRequest;
      readonly error: string;
    };

export type GuardToolsOptions = {
  readonly policy?: ToolPolicy;
  readonly approval?: ToolApprovalHandler;
  readonly budget?: RunBudget;
  readonly onEvent?: (event: ToolExecutionEvent) => void | Promise<void>;
};

function summarizeInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") {
    return `Execute ${toolName}`;
  }

  const values = input as Record<string, unknown>;
  const filePath = typeof values.path === "string" ? values.path : undefined;
  const outputPath =
    typeof values.output_path === "string" ? values.output_path : undefined;

  if (toolName === "edit_file" && filePath) {
    return `Edit file: ${filePath}`;
  }

  if (toolName === "write_file" && filePath) {
    return `Write file: ${filePath}`;
  }

  if (toolName === "create_skill") {
    const skillId = typeof values.id === "string" ? values.id : "<unknown>";
    return `Create skill: ${skillId}`;
  }

  if (
    toolName === "replace_book_chapter_text" ||
    toolName === "rewrite_book_chapter_text" ||
    toolName === "generate_book_chapter_content"
  ) {
    const chapterId = typeof values.chapter_id === "string"
      ? values.chapter_id
      : "<unknown>";
    return `Edit saved chapter text: ${chapterId}`;
  }

  if (toolName === "merge_text") {
    return `Merge text${outputPath ? ` into: ${outputPath}` : " inline"}`;
  }

  if (toolName === "apply_active_editor_styles") {
    const operationCount = Array.isArray(values.operations)
      ? values.operations.length
      : 0;
    return `Apply ${operationCount} targeted editor style operation${operationCount === 1 ? "" : "s"}`;
  }

  if (
    [
      "edit_text_range",
      "batch_edit_text",
      "normalize_text",
      "replace_text",
      "transform_lines",
    ].includes(toolName)
  ) {
    const source = filePath ?? "inline text";
    return `Process text with ${toolName}: ${source}`;
  }

  return filePath ? `Execute ${toolName}: ${filePath}` : `Execute ${toolName}`;
}

async function emit(
  handler: GuardToolsOptions["onEvent"],
  event: ToolExecutionEvent,
) {
  await handler?.(event);
}

export function guardTools(
  tools: readonly ClientTool[],
  options: GuardToolsOptions = {},
): ClientTool[] {
  const policy = options.policy ?? new ToolPolicy();
  const approval = options.approval ?? denyToolApproval;

  return tools.map((registeredTool) => {
    if (!isStructuredTool(registeredTool)) {
      throw new Error(
        `Tool cannot be guarded because it has no structured schema: ${registeredTool.name}`,
      );
    }

    const originalTool = registeredTool;

    return new DynamicStructuredTool({
      name: originalTool.name,
      description: originalTool.description,
      schema: originalTool.schema,
      returnDirect: originalTool.returnDirect,
      func: async (input, _runManager, config) => {
        const toolCallId = `tool_call_${crypto.randomUUID()}`;
        const request: ToolApprovalRequest = Object.freeze({
          toolCallId,
          toolName: originalTool.name,
          summary: summarizeInput(originalTool.name, input),
          input,
        });
        const permission = policy.getPermission(originalTool.name, input);

        if (permission === "deny") {
          await emit(options.onEvent, { type: "tool_rejected", toolCallId, request });
          return `Tool execution denied by policy: ${originalTool.name}`;
        }

        if (permission === "ask") {
          await emit(options.onEvent, {
            type: "tool_approval_requested",
            toolCallId,
            request,
          });
          const decision = await approval(request);

          if (decision === "deny") {
            await emit(options.onEvent, { type: "tool_rejected", toolCallId, request });
            return `Tool execution denied by user: ${originalTool.name}`;
          }

          if (decision === "allow_session") {
            policy.allowForSession(originalTool.name);
          }

          await emit(options.onEvent, { type: "tool_approved", toolCallId, request });
        }

        options.budget?.consumeToolCall(originalTool.name);
        await emit(options.onEvent, { type: "tool_started", toolCallId, request });

        try {
          const result = await originalTool.invoke(input, config);
          await emit(options.onEvent, { type: "tool_completed", toolCallId, request });
          return result;
        } catch (error) {
          await emit(options.onEvent, {
            type: "tool_failed",
            toolCallId,
            request,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    });
  });
}
