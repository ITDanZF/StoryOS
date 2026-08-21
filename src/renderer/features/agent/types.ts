import type {
  AgentServiceStatus,
  ConversationScope,
  MessageDto,
  ProjectNavigationSnapshot,
  ProjectSnapshot,
  RunSnapshot,
  ThreadSnapshot,
  ToolApprovalDecision,
} from "../../../shared/agent/contracts.ts";

export type MessageView = MessageDto & {
  readonly streaming?: boolean;
};

export type PendingToolApprovalView = {
  readonly approvalId: string;
  readonly runId: string;
  readonly threadId: string;
  readonly conversationScope: ConversationScope;
  readonly toolName: string;
  readonly summary: string;
  readonly preview: string;
  readonly requestedAt: string;
};

export type ToolActivityView = {
  readonly id: string;
  readonly runId: string;
  readonly threadId: string;
  readonly toolName: string;
  readonly summary: string;
  readonly status: "started" | "approved" | "rejected" | "completed" | "failed";
  readonly error?: string;
  readonly updatedAt: string;
};

export type ResolveToolApproval = (
  approvalId: string,
  decision: ToolApprovalDecision,
) => Promise<void>;

export type ChatWorkspaceState = {
  readonly loading: boolean;
  readonly status: AgentServiceStatus | null;
  readonly projects: ProjectSnapshot | null;
  readonly threads: ThreadSnapshot | null;
  readonly conversationScope: ConversationScope;
  readonly globalThreads: ThreadSnapshot | null;
  readonly projectNavigations: Readonly<Record<string, ProjectNavigationSnapshot>>;
  readonly messages: readonly MessageView[];
  readonly runs: readonly RunSnapshot[];
  readonly pendingApprovals: readonly PendingToolApprovalView[];
  readonly toolActivities: readonly ToolActivityView[];
  readonly error: string | null;
};
