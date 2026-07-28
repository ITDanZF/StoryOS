import type { MessageRole, ThreadMetadata, ThreadSkillState } from "./threadPorts.ts";

export type ThreadDto = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: ThreadMetadata;
};

export type MessageDto = {
  readonly id: string;
  readonly threadId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: string;
};

export type ThreadSnapshot = {
  readonly activeThreadId: string | null;
  readonly activeThread: ThreadDto | null;
  readonly threads: readonly ThreadDto[];
};

export type CreateThreadRequest = {
  readonly title: string;
  readonly id?: string;
};
export type AppendMessageRequest = {
  readonly role: MessageRole;
  readonly content: string;
  readonly threadId?: string;
};
export type ThreadSkillStateDto = ThreadSkillState;
