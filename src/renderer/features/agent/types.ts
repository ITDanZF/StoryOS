import type {
  AgentServiceStatus,
  ChapterGenerationMode,
  ConversationScope,
  ProjectNavigationSnapshot,
  ProjectSnapshot,
  RunSnapshot,
  ThreadSnapshot,
  ToolApprovalDecision,
} from "../../../shared/agent/contracts.ts";

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

export type ChapterGenerationView = {
  readonly generationId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly mode: ChapterGenerationMode;
  readonly initialText: string;
  readonly generatedText: string;
  readonly sequence: number;
  readonly status: "streaming" | "completed" | "failed";
  readonly content?: string;
  readonly revisionNumber?: number;
  readonly characterCount?: number;
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
  readonly runs: readonly RunSnapshot[];
  readonly pendingApprovals: readonly PendingToolApprovalView[];
  readonly bookChangeVersions: Readonly<Record<string, number>>;
  readonly chapterGenerations: Readonly<Record<string, ChapterGenerationView>>;
  readonly error: string | null;
};
