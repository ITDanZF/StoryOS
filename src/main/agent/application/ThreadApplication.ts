import type { AppendMessageRequest, CreateThreadRequest, MessageDto, ThreadDto, ThreadSnapshot } from "./threadContracts.ts";
import type { MessageRecord, ThreadPersistence, ThreadRecord, ThreadSkillState } from "./threadPorts.ts";

function normalizeSkillIds(skillIds: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...new Set((skillIds ?? []).map((skillId) => skillId.trim()).filter(Boolean))].sort());
}

function normalizeSkillState(thread: ThreadRecord): ThreadSkillState {
  return Object.freeze({
    activeSkillIds: normalizeSkillIds(thread.metadata?.activeSkillIds),
    disabledSkillIds: normalizeSkillIds(thread.metadata?.disabledSkillIds),
  });
}

function toThreadDto(thread: ThreadRecord): ThreadDto {
  const state = normalizeSkillState(thread);
  return Object.freeze({
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    metadata: Object.freeze({ activeSkillIds: state.activeSkillIds, disabledSkillIds: state.disabledSkillIds }),
  });
}

function toMessageDto(message: MessageRecord): MessageDto {
  return Object.freeze({
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  });
}

export default class ThreadApplication {
  private activeThreadId: string | null;

  constructor(private readonly store: ThreadPersistence) {
    const persistedThreadId = store.getActiveThreadId();
    this.activeThreadId =
      persistedThreadId && store.getThread(persistedThreadId)
        ? persistedThreadId
        : store.listThreads()[0]?.id ?? null;
    store.setActiveThreadId(this.activeThreadId);
  }

  getActiveThreadId(): string | null { return this.activeThreadId; }

  getSnapshot(): ThreadSnapshot {
    const threads = this.store.listThreads();
    if (
      this.activeThreadId !== null &&
      !threads.some((thread) => thread.id === this.activeThreadId)
    ) {
      this.activeThreadId = threads[0]?.id ?? null;
    }
    if (this.store.getActiveThreadId() !== this.activeThreadId) {
      this.store.setActiveThreadId(this.activeThreadId);
    }
    const activeThread = this.activeThreadId
      ? this.requireThread(this.activeThreadId)
      : null;
    return Object.freeze({
      activeThreadId: this.activeThreadId,
      activeThread: activeThread ? toThreadDto(activeThread) : null,
      threads: Object.freeze(this.store.listThreads().map(toThreadDto)),
    });
  }

  createThread(request: CreateThreadRequest): ThreadDto {
    const title = request.title.trim();
    if (!title) throw new Error("Thread title is required.");
    const thread = this.store.createThread(title, request.id);
    this.activeThreadId = thread.id;
    this.store.setActiveThreadId(thread.id);
    return toThreadDto(thread);
  }

  switchThread(threadId: string): ThreadSnapshot {
    const normalizedId = threadId.trim();
    this.requireThread(normalizedId);
    this.activeThreadId = normalizedId;
    this.store.setActiveThreadId(normalizedId);
    return this.getSnapshot();
  }

  appendMessage(request: AppendMessageRequest): MessageDto {
    const threadId = request.threadId === undefined
      ? this.requireActiveThreadId()
      : request.threadId.trim();
    this.requireThread(threadId);
    return toMessageDto(this.store.appendMessage({ threadId, role: request.role, content: request.content }));
  }

  listMessages(threadId?: string): readonly MessageDto[] {
    const resolvedThreadId = threadId === undefined
      ? this.requireActiveThreadId()
      : threadId.trim();
    this.requireThread(resolvedThreadId);
    return Object.freeze(this.store.listMessages(resolvedThreadId).map(toMessageDto));
  }

  deleteThread(threadId: string): ThreadSnapshot {
    const normalizedId = threadId.trim();
    this.requireThread(normalizedId);
    this.store.deleteThread(normalizedId);
    if (normalizedId === this.activeThreadId) {
      this.activeThreadId = this.store.listThreads()[0]?.id ?? null;
      this.store.setActiveThreadId(this.activeThreadId);
    }
    return this.getSnapshot();
  }

  getThreadSkillState(threadId?: string): ThreadSkillState {
    return normalizeSkillState(this.requireThread(this.resolveThreadId(threadId)));
  }

  useSkill(skillId: string, threadId?: string): ThreadSkillState {
    const normalizedSkillId = this.normalizeSkillId(skillId);
    const thread = this.requireThread(this.resolveThreadId(threadId));
    const state = normalizeSkillState(thread);
    const updated = this.store.updateThreadMetadata(thread.id, {
      ...thread.metadata,
      activeSkillIds: normalizeSkillIds([...state.activeSkillIds, normalizedSkillId]),
      disabledSkillIds: normalizeSkillIds(state.disabledSkillIds.filter((item) => item !== normalizedSkillId)),
    });
    return normalizeSkillState(updated);
  }

  disableSkill(skillId: string, threadId?: string): ThreadSkillState {
    const normalizedSkillId = this.normalizeSkillId(skillId);
    const thread = this.requireThread(this.resolveThreadId(threadId));
    const state = normalizeSkillState(thread);
    const updated = this.store.updateThreadMetadata(thread.id, {
      ...thread.metadata,
      activeSkillIds: normalizeSkillIds(state.activeSkillIds.filter((item) => item !== normalizedSkillId)),
      disabledSkillIds: normalizeSkillIds([...state.disabledSkillIds, normalizedSkillId]),
    });
    return normalizeSkillState(updated);
  }

  clearSkillState(threadId?: string): ThreadSkillState {
    const thread = this.requireThread(this.resolveThreadId(threadId));
    return normalizeSkillState(this.store.updateThreadMetadata(thread.id, {
      ...thread.metadata,
      activeSkillIds: Object.freeze([]),
      disabledSkillIds: Object.freeze([]),
    }));
  }

  private requireThread(threadId: string): ThreadRecord {
    if (!threadId) throw new Error("Thread id is required.");
    const thread = this.store.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    return thread;
  }

  private requireActiveThreadId(): string {
    if (!this.activeThreadId) throw new Error("No active thread.");
    return this.activeThreadId;
  }

  private resolveThreadId(threadId: string | undefined): string {
    return threadId === undefined
      ? this.requireActiveThreadId()
      : threadId.trim();
  }

  private normalizeSkillId(skillId: string): string {
    const normalizedSkillId = skillId.trim();
    if (!normalizedSkillId) throw new Error("Skill id is required.");
    return normalizedSkillId;
  }
}
