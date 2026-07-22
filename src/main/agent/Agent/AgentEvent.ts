import type { ExecutionContext } from "./ExecutionContext.ts";
import type { ToolExecutionEvent } from "../security/GuardedTool.ts";

export type AgentEventSource = Pick<
  ExecutionContext,
  "runId" | "agentType"
>;

export type AgentEventPayload =
  | {
      readonly type: "run_started";
      readonly threadId: string;
      readonly parentRunId?: string;
      readonly depth: number;
    }
  | {
      readonly type: "text_delta";
      readonly content: string;
    }
  | {
      readonly type: "skill_selected";
      readonly skills: readonly {
        readonly id: string;
        readonly name: string;
        readonly score: number;
        readonly reasons: readonly string[];
        readonly matchedTerms: readonly string[];
      }[];
    }
  | {
      readonly type: "run_completed";
      readonly content: string;
    }
  | {
      readonly type: "run_aborted";
      readonly partialContent: string;
    }
  | {
      readonly type: "run_failed";
      readonly partialContent: string;
      readonly error: string;
    }
  | {
      readonly type: "run_timed_out";
      readonly partialContent: string;
      readonly timeoutMs: number;
    }
  | {
      readonly type:
        | "tool_started"
        | "tool_approval_requested"
        | "tool_approved"
        | "tool_rejected"
        | "tool_completed";
      readonly toolName: string;
      readonly summary: string;
    }
  | {
      readonly type: "tool_failed";
      readonly toolName: string;
      readonly summary: string;
      readonly error: string;
    };

export type AgentEvent = AgentEventSource & AgentEventPayload;

export type AgentEventHandler = (
  event: AgentEvent,
) => void | Promise<void>;

export function createAgentEvent(
  source: AgentEventSource,
  payload: AgentEventPayload,
): AgentEvent {
  return Object.freeze({
    ...payload,
    runId: source.runId,
    agentType: source.agentType,
  }) as AgentEvent;
}

export async function emitAgentEvent(
  handler: AgentEventHandler | undefined,
  event: AgentEvent,
): Promise<void> {
  await handler?.(event);
}

export async function emitToolExecutionEvent(
  handler: AgentEventHandler | undefined,
  source: AgentEventSource,
  event: ToolExecutionEvent,
): Promise<void> {
  if (event.type === "tool_failed") {
    await emitAgentEvent(
      handler,
      createAgentEvent(source, {
        type: "tool_failed",
        toolName: event.request.toolName,
        summary: event.request.summary,
        error: event.error,
      }),
    );
    return;
  }

  await emitAgentEvent(
    handler,
    createAgentEvent(source, {
      type: event.type,
      toolName: event.request.toolName,
      summary: event.request.summary,
    }),
  );
}
