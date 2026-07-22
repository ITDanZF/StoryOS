import JsonStore, {
  type StoredMessage,
  type StoredMessageRole,
  type ThreadInfo,
} from "./JsonStore.ts";
export type { StoredMessage, StoredMessageRole, ThreadInfo };

export type CreateConversationInput = {
  id?: string;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export default class Conversation {
  private readonly store: JsonStore;
  private ActiveThreadId: string;
  private ActiveConversation: ThreadInfo;

  constructor(store = new JsonStore()) {
    this.store = store;
    this.ActiveConversation = this.store.ensureInitialThread();
    this.ActiveThreadId = this.ActiveConversation.id;
  }

  UUID() {
    return crypto.randomUUID();
  }

  createConversation(info: CreateConversationInput) {
    const thread = this.store.createThread(info.title, info.id);
    return thread.id;
  }

  switchConversation(threadId: string) {
    const thread = this.store.getThread(threadId);

    if (!thread) {
      throw new Error(`Thread with ID ${threadId} does not exist.`);
    }

    this.ActiveThreadId = thread.id;
    this.ActiveConversation = thread;
  }

  getActiveConversation(): ThreadInfo {
    return this.ActiveConversation;
  }

  getAllConversations(): ThreadInfo[] {
    return this.store.listThreads();
  }

  getActiveThreadId(): string {
    return this.ActiveThreadId;
  }

  touchActiveConversation() {
    this.store.touchThread(this.ActiveThreadId);

    const thread = this.store.getThread(this.ActiveThreadId);
    if (thread) {
      this.ActiveConversation = thread;
    }
  }

  appendMessage(input: {
    role: StoredMessageRole;
    content: string;
    threadId?: string;
  }): StoredMessage {
    const threadId = input.threadId ?? this.ActiveThreadId;

    const message = this.store.appendMessage({
      threadId,
      role: input.role,
      content: input.content,
    });

    if (threadId === this.ActiveThreadId) {
      const thread = this.store.getThread(threadId);
      if (thread) {
        this.ActiveConversation = thread;
      }
    }

    return message;
  }

  listMessages(threadId = this.ActiveThreadId): StoredMessage[] {
    return this.store.listMessages(threadId);
  }

  deleteConversation(threadId: string) {
    this.store.deleteThread(threadId);

    if (threadId === this.ActiveThreadId) {
      const initialThread = this.store.ensureInitialThread();
      this.ActiveThreadId = initialThread.id;
      this.ActiveConversation = initialThread;
    }
  }
}
