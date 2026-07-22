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
  | { readonly type: "tool_started"; readonly request: ToolApprovalRequest }
  | {
      readonly type: "tool_approval_requested";
      readonly request: ToolApprovalRequest;
    }
  | { readonly type: "tool_approved"; readonly request: ToolApprovalRequest }
  | { readonly type: "tool_rejected"; readonly request: ToolApprovalRequest }
  | { readonly type: "tool_completed"; readonly request: ToolApprovalRequest }
  | {
      readonly type: "tool_failed";
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
        const request: ToolApprovalRequest = Object.freeze({
          toolName: originalTool.name,
          summary: summarizeInput(originalTool.name, input),
          input,
        });
        const permission = policy.getPermission(originalTool.name);

        if (permission === "deny") {
          await emit(options.onEvent, { type: "tool_rejected", request });
          return `Tool execution denied by policy: ${originalTool.name}`;
        }

        if (permission === "ask") {
          await emit(options.onEvent, {
            type: "tool_approval_requested",
            request,
          });
          const decision = await approval(request);

          if (decision === "deny") {
            await emit(options.onEvent, { type: "tool_rejected", request });
            return `Tool execution denied by user: ${originalTool.name}`;
          }

          if (decision === "allow_session") {
            policy.allowForSession(originalTool.name);
          }

          await emit(options.onEvent, { type: "tool_approved", request });
        }

        options.budget?.consumeToolCall(originalTool.name);
        await emit(options.onEvent, { type: "tool_started", request });

        try {
          const result = await originalTool.invoke(input, config);
          await emit(options.onEvent, { type: "tool_completed", request });
          return result;
        } catch (error) {
          await emit(options.onEvent, {
            type: "tool_failed",
            request,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    });
  });
}
