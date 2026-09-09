import type { MessageRole, ThreadMetadata } from "../../engine/skills/threadPorts.ts";

export type ThreadSnapshot = {
  readonly activeThreadId: string | null;
  readonly activeThread: ThreadDto | null;
  readonly threads: readonly ThreadDto[];
};

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
