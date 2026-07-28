import type {
  AgentServiceStatus,
  ConversationScope,
  MessageDto,
  ProjectNavigationSnapshot,
  ProjectSnapshot,
  RunSnapshot,
  ThreadSnapshot,
} from "../../../shared/agent/contracts.ts";

export type MessageView = MessageDto & {
  readonly streaming?: boolean;
};

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
  readonly error: string | null;
};
