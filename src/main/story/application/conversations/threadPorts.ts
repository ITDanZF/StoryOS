import type {
  MessageRole,
  ThreadMetadata,
} from "../../../../shared/engine/skills/threadPorts.ts";
export type {
  MessageRole,
  ThreadMetadata,
  ThreadSkillState,
} from "../../../../shared/engine/skills/threadPorts.ts";

export type ThreadRecord = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata?: ThreadMetadata;
};

export type MessageRecord = {
  readonly id: string;
  readonly threadId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: Date;
};

export interface ThreadStore {
  getActiveThreadId(): string | null;
  setActiveThreadId(threadId: string | null): void;
  createThread(title: string, id?: string, metadata?: ThreadMetadata): ThreadRecord;
  getThread(threadId: string): ThreadRecord | null;
  listThreads(): ThreadRecord[];
  touchThread(threadId: string): void;
  updateThreadTitle(threadId: string, title: string): ThreadRecord;
  updateThreadMetadata(threadId: string, metadata: ThreadMetadata): ThreadRecord;
  deleteThread(threadId: string): void;
}

export interface MessageStore {
  appendMessage(input: {
    threadId: string;
    role: MessageRole;
    content: string;
    id?: string;
  }): MessageRecord;
  listMessages(threadId: string): MessageRecord[];
}

export type ThreadPersistence = ThreadStore & MessageStore;
