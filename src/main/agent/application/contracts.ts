import type { ToolApprovalDecision } from "../security/ToolPolicy.ts";
import type { OrchestrationEvent } from "../Agent/orchestration/contracts.ts";

export type StartRunRequest = {
  readonly threadId: string;
  readonly input: string;
};

export type SerializableError = {
  readonly name: string;
  readonly message: string;
};

export type RunStatus =
  | "running"
  | "cancelling"
  | "completed"
  | "aborted"
  | "timed_out"
  | "failed";

export type RunSnapshot = {
  readonly runId: string;
  readonly threadId: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly content?: string;
  readonly error?: SerializableError;
};

export type ApplicationEvent =
  | {
      readonly type: "run_started";
      readonly runId: string;
      readonly threadId: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "text_delta";
      readonly runId: string;
      readonly content: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "approval_requested";
      readonly runId: string;
      readonly approvalId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly preview: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "approval_resolved";
      readonly runId: string;
      readonly approvalId: string;
      readonly decision: ToolApprovalDecision;
      readonly timestamp: string;
    }
  | {
      readonly type: "agent_status";
      readonly runId: string;
      readonly agentRunId: string;
      readonly agentType: string;
      readonly status: "started" | "completed" | "aborted" | "timed_out" | "failed";
      readonly error?: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "skill_selected";
      readonly runId: string;
      readonly skills: readonly {
        readonly id: string;
        readonly name: string;
        readonly score: number;
        readonly reasons: readonly string[];
        readonly matchedTerms: readonly string[];
      }[];
      readonly timestamp: string;
    }
  | {
      readonly type: "tool_status";
      readonly runId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly status: "started" | "approved" | "rejected" | "completed" | "failed";
      readonly error?: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "run_completed";
      readonly runId: string;
      readonly content: string;
      readonly durationMs: number;
      readonly timestamp: string;
    }
  | {
      readonly type: "run_aborted" | "run_timed_out" | "run_failed";
      readonly runId: string;
      readonly error: SerializableError;
      readonly durationMs: number;
      readonly timestamp: string;
    }
  | OrchestrationEvent;

export type ApplicationEventHandler = (
  event: ApplicationEvent,
) => void | Promise<void>;
