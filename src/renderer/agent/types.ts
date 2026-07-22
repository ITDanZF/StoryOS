import type {
  AgentServiceStatus,
  MessageDto,
  ProjectSnapshot,
  RunSnapshot,
  ThreadSnapshot,
} from "../../shared/agent/contracts.ts";

export type MessageView = MessageDto & {
  readonly streaming?: boolean;
};

export type ChatWorkspaceState = {
  readonly loading: boolean;
  readonly status: AgentServiceStatus | null;
  readonly projects: ProjectSnapshot | null;
  readonly threads: ThreadSnapshot | null;
  readonly messages: readonly MessageView[];
  readonly runs: readonly RunSnapshot[];
  readonly error: string | null;
};
